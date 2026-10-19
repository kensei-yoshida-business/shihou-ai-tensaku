import Stripe from "stripe";
import { prisma } from "./db";

let client: Stripe | null = null;

/** STRIPE_SECRET_KEY が未設定でもビルドやページ表示は通るよう、使う時に初めて生成する */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

export type PlanKey = "ticket_1" | "ticket_5" | "sub_standard" | "sub_unlimited";

export type Plan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountJpy: number; // 税込金額（Stripe の Price 作成に使う）
  description: string;
  mode: "payment" | "subscription";
  priceEnv: string;
  credits?: number; // 一回払い: 付与するチケット枚数
  subPlan?: "standard" | "unlimited";
  monthlyQuota?: number | null; // サブスク: 月の添削枠（null = 無制限）
};

// 金額・通数は仮置き。Stripe 側の Price と合わせて変更する
export const PLANS: Record<PlanKey, Plan> = {
  ticket_1: {
    key: "ticket_1", name: "添削チケット 1通", priceLabel: "800円", amountJpy: 800, mode: "payment",
    description: "論文式答案1通の添削。購入から30日間は短答一問一答も無制限。",
    priceEnv: "STRIPE_PRICE_TICKET_1", credits: 1,
  },
  ticket_5: {
    key: "ticket_5", name: "添削チケット 5通パック", priceLabel: "3,600円", amountJpy: 3600, mode: "payment",
    description: "1通あたり720円。チケットに有効期限はありません。",
    priceEnv: "STRIPE_PRICE_TICKET_5", credits: 5,
  },
  sub_standard: {
    key: "sub_standard", name: "スタンダード（月額）", priceLabel: "4,980円/月", amountJpy: 4980, mode: "subscription",
    description: "毎月10通まで添削。短答一問一答は無制限。",
    priceEnv: "STRIPE_PRICE_SUB_STANDARD", subPlan: "standard", monthlyQuota: 10,
  },
  sub_unlimited: {
    key: "sub_unlimited", name: "無制限（月額）", priceLabel: "9,800円/月", amountJpy: 9800, mode: "subscription",
    description: "添削・短答一問一答とも無制限（添削は全プラン共通で1日20通まで）。",
    priceEnv: "STRIPE_PRICE_SUB_UNLIMITED", subPlan: "unlimited", monthlyQuota: null,
  },
};

export function priceIdFor(plan: Plan): string {
  const id = process.env[plan.priceEnv];
  if (!id) throw new Error(`${plan.priceEnv} is not set`);
  return id;
}

/** Stripe の Price ID からサブスクのプランを逆引きする（Webhook 用） */
export function subPlanByPriceId(priceId: string): Plan | undefined {
  return Object.values(PLANS).find((p) => p.mode === "subscription" && process.env[p.priceEnv] === priceId);
}

/** ユーザーに紐づく Stripe Customer を返す。なければ作成して保存する */
export async function getOrCreateCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}
