import type Stripe from "stripe";
import { applyStripeEvent } from "@/lib/billing";
import { stripe } from "@/lib/stripe";

// POST /api/webhooks/stripe  Stripe ダッシュボードで以下のイベントを送るよう設定する:
//   checkout.session.completed / checkout.session.async_payment_succeeded
//   customer.subscription.created / updated / deleted
//   charge.refunded / charge.dispute.created / charge.dispute.closed
export async function POST(req: Request) {
  const body = await req.text(); // 署名検証には加工前の生ボディが必要
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  try {
    const result = await applyStripeEvent(event);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error("stripe webhook failed", event.id, event.type, e);
    return new Response("webhook handler failed", { status: 500 }); // 500 を返すと Stripe が再送する
  }
}
