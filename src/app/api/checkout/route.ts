import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getOrCreateCustomer, PLANS, priceIdFor, stripe, type PlanKey } from "@/lib/stripe";

const Body = z.object({ plan: z.enum(Object.keys(PLANS) as [PlanKey, ...PlanKey[]]) });

// POST /api/checkout  { plan } → Stripe Checkout の URL を返す。
// チケットの付与・サブスクの反映はここではなく Webhook だけが行う（success_url の直打ち対策）
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "unknown_plan");
  const plan = PLANS[parsed.data.plan];

  if (plan.mode === "subscription") {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (sub && ["active", "trialing", "past_due"].includes(sub.status)) {
      return jsonError(409, "already_subscribed", { message: "プランの変更・解約は会員ページから行えます" });
    }
  }

  const customer = await getOrCreateCustomer(userId);
  const origin = new URL(req.url).origin;
  const session = await stripe().checkout.sessions.create({
    mode: plan.mode,
    customer,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    client_reference_id: userId,
    metadata: { userId, plan: plan.key, credits: String(plan.credits ?? 0) },
    ...(plan.mode === "subscription" ? { subscription_data: { metadata: { userId, plan: plan.key } } } : {}),
    success_url: `${origin}/submit?paid=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    locale: "ja",
  });
  if (!session.url) return jsonError(500, "checkout_failed");
  return NextResponse.json({ url: session.url });
}
