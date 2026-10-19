import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { stripe } from "@/lib/stripe";

// POST /api/billing-portal  サブスクの解約・カード変更用の Stripe カスタマーポータル
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) return jsonError(400, "no_customer", { message: "決済履歴がありません" });

  const portal = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${new URL(req.url).origin}/account`,
    locale: "ja",
  });
  return NextResponse.json({ url: portal.url });
}
