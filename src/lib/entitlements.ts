import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

export type PaidBy = "ticket" | "subscription";
type Db = PrismaClient | Prisma.TransactionClient;

/** 短答 一問一答の1日あたり上限（無料会員） */
export const TANTO_FREE_DAILY_LIMIT = 30;
/** 論文添削の1日あたり上限（全プラン共通。無制限プランの濫用と API 費用の暴走を防ぐ） */
export const REVIEW_DAILY_LIMIT = 20;
/** これより長く「添削中」のままの添削は、処理が途中で止まったものとみなす（関数の最大実行時間 300 秒より長く取る） */
const STALE_RUNNING_MS = 10 * 60 * 1000;
/** チケット購入者が短答を無制限に使える期間 */
const TICKET_TANTO_BONUS_DAYS = 30;

async function activeSubscription(db: Db, userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== "active" || sub.currentPeriodEnd <= new Date()) return null;
  return sub;
}

export async function getEntitlement(userId: string, db: Db = prisma) {
  const [credits, sub] = await Promise.all([
    db.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } }),
    activeSubscription(db, userId),
  ]);
  const ticketBalance = credits._sum.delta ?? 0;

  let subRemaining: number | null = null; // null = 無制限（または未加入）
  if (sub && sub.monthlyQuota != null) {
    const used = await db.review.count({
      where: {
        userId,
        paidBy: "subscription",
        status: { in: ["running", "done"] },
        createdAt: { gte: sub.currentPeriodStart },
      },
    });
    subRemaining = Math.max(0, sub.monthlyQuota - used);
  }
  return { ticketBalance, subActive: !!sub, subPlan: sub?.plan ?? null, subRemaining };
}

/**
 * 論文添削1回分の利用権を確保する。利用権がなければ "payment_required"、今日の上限に達していれば "daily_limit"。
 * 同一ユーザーの同時送信で残数がマイナスにならないよう、User 行をロックして直列化する。
 */
export async function reserveReview(userId: string): Promise<PaidBy | "payment_required" | "daily_limit"> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await recoverStaleReviews(tx, userId);
    const today = await tx.review.count({
      where: { userId, status: { in: ["running", "done"] }, createdAt: { gte: startOfTodayJst() } },
    });
    if (today >= REVIEW_DAILY_LIMIT) return "daily_limit";
    const e = await getEntitlement(userId, tx);
    if (e.subActive && (e.subRemaining === null || e.subRemaining > 0)) return "subscription";
    if (e.ticketBalance > 0) {
      await tx.creditLedger.create({ data: { userId, delta: -1, reason: "consume" } });
      return "ticket";
    }
    return "payment_required";
  });
}

/**
 * 関数のタイムアウトやデプロイで処理が途中で止まり「添削中」のまま残った添削を失敗にし、チケットを返す。
 * サブスク利用分は status が error になれば自動的に月の枠に戻る。
 */
export async function recoverStaleReviews(db: Db, userId: string) {
  const stale = await db.review.findMany({
    where: { userId, status: "running", createdAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    select: { id: true, paidBy: true },
  });
  for (const r of stale) {
    // 同時に別の処理が完了させていたら何もしない
    const { count } = await db.review.updateMany({ where: { id: r.id, status: "running" }, data: { status: "error" } });
    if (count === 1 && r.paidBy === "ticket") {
      await db.creditLedger.create({ data: { userId, delta: 1, reason: "refund_on_error", reviewId: r.id } });
    }
  }
}

/** 添削失敗・差し戻し時にチケットを返す（サブスク利用分は Review の status で自動的に枠に戻る） */
export async function refundTicket(
  userId: string,
  reviewId: string,
  reason: "refund_on_error" | "refund_on_mismatch",
) {
  await prisma.creditLedger.create({ data: { userId, delta: 1, reason, reviewId } });
}

/** 短答 一問一答を今日あと何問解けるか。null は無制限 */
export async function tantoRemainingToday(userId: string): Promise<number | null> {
  if (await activeSubscription(prisma, userId)) return null;

  if (await hasRecentPaidPurchase(userId)) return null;

  const answeredToday = await prisma.tantoAttempt.count({
    where: { userId, createdAt: { gte: startOfTodayJst() } },
  });
  return Math.max(0, TANTO_FREE_DAILY_LIMIT - answeredToday);
}

/** 直近30日以内に、返金・チャージバックで全額取り消されていないチケット購入があるか */
async function hasRecentPaidPurchase(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - TICKET_TANTO_BONUS_DAYS * 24 * 60 * 60 * 1000);
  const purchases = await prisma.creditLedger.findMany({
    where: { userId, reason: "purchase", createdAt: { gte: since } },
    select: { delta: true, paymentIntentId: true },
  });
  for (const p of purchases) {
    if (!p.paymentIntentId) return true;
    const reversed = await prisma.creditLedger.aggregate({
      where: { paymentIntentId: p.paymentIntentId, reason: { in: ["stripe_refund", "stripe_dispute"] } },
      _sum: { delta: true },
    });
    if (p.delta + (reversed._sum.delta ?? 0) > 0) return true;
  }
  return false;
}

/** 日本時間の今日0時（UTC の Date として返す） */
export function startOfTodayJst(now = new Date()): Date {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}
