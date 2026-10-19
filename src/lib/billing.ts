import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "./db";
import { subPlanByPriceId } from "./stripe";

type Tx = Prisma.TransactionClient;

/**
 * Stripe の Webhook イベントを DB に反映する。決済状態を DB に書き込むのはこの関数だけ。
 * 同じイベントが再送されても二重に反映しない（StripeEvent の主キーで判定）。
 * 反映中にエラーが起きたらイベント記録ごとロールバックし、Stripe の再送で再処理させる。
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<"applied" | "duplicate" | "ignored"> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: { id: event.id, type: event.type } });
      return (await handle(tx, event)) ? "applied" : "ignored";
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "duplicate";
    throw e;
  }
}

async function handle(tx: Tx, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    // カード決済は completed 時点で paid。コンビニ払い等の遅延決済は async_payment_succeeded で paid になる
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.mode !== "payment" || s.payment_status !== "paid") return false;
      await grantTickets(tx, s);
      return true;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(tx, event.data.object);
      return true;
    // 返金: amount_refunded は累計なので、再送や部分返金の繰り返しでも結果は同じになる
    case "charge.refunded": {
      const c = event.data.object;
      const pi = idOf(c.payment_intent);
      if (!pi || c.amount <= 0) return false;
      return reconcileReversal(tx, pi, "stripe_refund", (credits) =>
        Math.ceil((credits * c.amount_refunded) / c.amount),
      );
    }
    // チャージバック: 申し立ての時点で残りのチケットをすべて取り消し、勝訴したら戻す
    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const d = event.data.object;
      const pi = idOf(d.payment_intent);
      if (!pi) return false;
      const restore = event.type === "charge.dispute.closed" && d.status === "won";
      return reconcileReversal(tx, pi, "stripe_dispute", (credits) => (restore ? 0 : credits));
    }
    default:
      return false;
  }
}

async function grantTickets(tx: Tx, s: Stripe.Checkout.Session) {
  const userId = s.metadata?.userId ?? s.client_reference_id;
  const credits = Number(s.metadata?.credits ?? 0);
  if (!userId || !Number.isInteger(credits) || credits <= 0) {
    throw new Error(`checkout session ${s.id} has no userId/credits metadata`);
  }
  // stripeRef は一意制約付き。completed と async_payment_succeeded の両方が来ても1回だけ付与する
  const already = await tx.creditLedger.findUnique({ where: { stripeRef: s.id } });
  if (already) return;
  await tx.creditLedger.create({
    data: { userId, delta: credits, reason: "purchase", stripeRef: s.id, paymentIntentId: idOf(s.payment_intent) },
  });
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

type ReversalReason = "stripe_refund" | "stripe_dispute";

/**
 * チケット購入の返金・チャージバックに合わせて、取り消すチケット枚数を「あるべき値」にそろえる。
 * target(購入枚数) がこの理由で取り消すべき累計枚数を返し、既に取り消した分との差だけを台帳に記録する。
 * 返金とチャージバックの合計が購入枚数を超えないようにする。
 * 該当する購入がなければ（月額プランの支払いなど）何もしない。
 */
export async function reconcileReversal(
  tx: Tx,
  paymentIntentId: string,
  reason: ReversalReason,
  target: (credits: number) => number,
): Promise<boolean> {
  const purchase = await tx.creditLedger.findFirst({ where: { paymentIntentId, reason: "purchase" } });
  if (!purchase) return false;
  // 同じ購入に対するイベントが同時に届いても二重に取り消さないよう、ユーザー単位で直列化する
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${purchase.userId} FOR UPDATE`;

  const rows = await tx.creditLedger.groupBy({
    by: ["reason"],
    where: { paymentIntentId, reason: { in: ["stripe_refund", "stripe_dispute"] } },
    _sum: { delta: true },
  });
  const removed = (r: ReversalReason) => -(rows.find((x) => x.reason === r)?._sum.delta ?? 0);
  const other: ReversalReason = reason === "stripe_refund" ? "stripe_dispute" : "stripe_refund";

  const credits = purchase.delta;
  const want = Math.max(0, Math.min(target(credits), credits - removed(other)));
  const diff = want - removed(reason);
  if (diff === 0) return false;
  await tx.creditLedger.create({
    data: { userId: purchase.userId, delta: -diff, reason, paymentIntentId },
  });
  return true;
}

async function syncSubscription(tx: Tx, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user =
    (sub.metadata?.userId && (await tx.user.findUnique({ where: { id: sub.metadata.userId } }))) ||
    (await tx.user.findUnique({ where: { stripeCustomerId: customerId } }));
  if (!user) throw new Error(`no user for subscription ${sub.id}`);

  const item = sub.items.data[0];
  const plan = item ? subPlanByPriceId(item.price.id) : undefined;
  if (!item || !plan?.subPlan) throw new Error(`unknown price on subscription ${sub.id}`);

  const data = {
    stripeSubscriptionId: sub.id,
    status: sub.status,
    plan: plan.subPlan,
    monthlyQuota: plan.monthlyQuota ?? null,
    // 2025年以降の API では請求期間はサブスク本体ではなく各アイテムに付く
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  };
  await tx.subscription.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
}
