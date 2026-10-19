/**
 * Stripe に商品・価格（Price）・Webhook エンドポイントを作成し、Vercel に登録する環境変数を表示する。
 * 何度実行しても重複して作らない（Price は lookup_key、Webhook は URL で既存を探す）。
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup -- https://<本番ドメイン>
 *   STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup -- https://<本番ドメイン>
 *
 * テストモードと本番モードは別物なので、それぞれのキーで1回ずつ実行する。
 */
import Stripe from "stripe";
import { PLANS, type Plan } from "../src/lib/stripe";

// Webhook ハンドラ（src/lib/billing.ts）が処理するイベント
export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

const lookupKey = (plan: Plan) => `shihou_${plan.key}`;

export async function ensurePrice(stripe: Stripe, plan: Plan): Promise<Stripe.Price> {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey(plan)], active: true, limit: 1 });
  const existing = found.data[0];
  if (existing) {
    const recurring = existing.recurring?.interval ?? null;
    const wantRecurring = plan.mode === "subscription" ? "month" : null;
    if (existing.unit_amount !== plan.amountJpy || existing.currency !== "jpy" || recurring !== wantRecurring) {
      // Price は金額を変更できない。新しい Price を作り、lookup_key を付け替える
      console.log(`  ${plan.name}: 金額が変わったため新しい価格を作成します（${existing.unit_amount}円 → ${plan.amountJpy}円）`);
      return createPrice(stripe, plan, typeof existing.product === "string" ? existing.product : existing.product.id);
    }
    console.log(`  ${plan.name}: 既存の価格を使います`);
    return existing;
  }
  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: { plan: plan.key },
  });
  console.log(`  ${plan.name}: 商品と価格を作成しました`);
  return createPrice(stripe, plan, product.id);
}

function createPrice(stripe: Stripe, plan: Plan, productId: string) {
  return stripe.prices.create({
    product: productId,
    currency: "jpy",
    unit_amount: plan.amountJpy,
    tax_behavior: "inclusive", // 表示価格は税込
    lookup_key: lookupKey(plan),
    transfer_lookup_key: true,
    ...(plan.mode === "subscription" ? { recurring: { interval: "month" as const } } : {}),
    metadata: { plan: plan.key },
  });
}

export async function ensureWebhook(stripe: Stripe, url: string): Promise<{ id: string; secret?: string }> {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === url);
  if (existing) {
    const missing = WEBHOOK_EVENTS.filter((e) => !existing.enabled_events.includes(e));
    if (missing.length > 0) {
      await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS });
      console.log(`  Webhook: 既存のエンドポイントにイベントを追加しました（${missing.join(", ")}）`);
    } else {
      console.log("  Webhook: 既存のエンドポイントを使います");
    }
    if (existing.api_version && existing.api_version !== Stripe.API_VERSION) {
      console.warn(
        `  ⚠ Webhook の API バージョン（${existing.api_version}）がアプリの SDK（${Stripe.API_VERSION}）と異なります。` +
          "イベントの形式が変わるため、ダッシュボードでエンドポイントを作り直してください。",
      );
    }
    return { id: existing.id };
  }
  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    // アプリの SDK と同じ形式でイベントを受け取る（サブスクの請求期間の位置などがバージョンで異なる）
    api_version: Stripe.API_VERSION as Stripe.WebhookEndpointCreateParams.ApiVersion,
    description: "司法試験 AI添削",
  });
  console.log("  Webhook: エンドポイントを作成しました");
  return { id: created.id, secret: created.secret };
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const baseUrl = process.argv[2]?.replace(/\/$/, "");
  if (!key || !baseUrl?.startsWith("https://")) {
    console.error("使い方: STRIPE_SECRET_KEY=sk_... npm run stripe:setup -- https://<ドメイン>");
    process.exit(1);
  }
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const stripe = new Stripe(key);
  console.log(`Stripe ${live ? "【本番モード】" : "（テストモード）"} ${baseUrl}\n`);

  const env: string[] = [];
  for (const plan of Object.values(PLANS)) {
    const price = await ensurePrice(stripe, plan);
    env.push(`${plan.priceEnv}=${price.id}`);
  }

  const webhookUrl = `${baseUrl}/api/webhooks/stripe`;
  const webhook = await ensureWebhook(stripe, webhookUrl);
  env.push(
    webhook.secret
      ? `STRIPE_WEBHOOK_SECRET=${webhook.secret}`
      : `# STRIPE_WEBHOOK_SECRET は作成時にしか表示されません。ダッシュボードの Webhook（${webhook.id}）の「署名シークレット」から確認してください`,
  );

  console.log(`\nVercel の ${live ? "Production" : "Preview"} 環境に登録する値:\n`);
  console.log(env.join("\n"));
}

// テストから import したときは実行しない
if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
