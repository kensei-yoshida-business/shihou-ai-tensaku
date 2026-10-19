import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { ensurePrice, ensureWebhook, WEBHOOK_EVENTS } from "../scripts/stripe-setup";
import { PLANS } from "../src/lib/stripe";

/** Stripe API のうちスクリプトが使う部分だけを再現したメモリ上の偽物 */
function fakeStripe() {
  const prices: Record<string, unknown>[] = [];
  const endpoints: Record<string, unknown>[] = [];
  let n = 0;
  const api = {
    products: { create: async (p: object) => ({ id: `prod_${++n}`, ...p }) },
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: prices.filter((p) => lookup_keys.includes(p.lookup_key as string)),
      }),
      create: async (p: Record<string, unknown>) => {
        // transfer_lookup_key: 既存 Price から lookup_key を外して新しい Price に付ける
        for (const old of prices) if (old.lookup_key === p.lookup_key) old.lookup_key = null;
        const price = { id: `price_${++n}`, ...p, recurring: p.recurring ?? null };
        prices.push(price);
        return price;
      },
    },
    webhookEndpoints: {
      list: async () => ({ data: endpoints }),
      create: async (p: Record<string, unknown>) => {
        const e = { id: `we_${++n}`, secret: "whsec_new", ...p };
        endpoints.push(e);
        return e;
      },
      update: async (id: string, p: Record<string, unknown>) => Object.assign(endpoints.find((e) => e.id === id)!, p),
    },
  };
  return { stripe: api as unknown as Stripe, prices, endpoints };
}

test("価格は2回目の実行では作り直さず、金額を変えたときだけ新しく作る", async () => {
  const { stripe, prices } = fakeStripe();
  const first = await ensurePrice(stripe, PLANS.sub_standard);
  assert.equal(first.unit_amount, 4980);
  assert.deepEqual(first.recurring, { interval: "month" });
  assert.equal((await ensurePrice(stripe, PLANS.sub_standard)).id, first.id);
  assert.equal(prices.length, 1);

  const changed = await ensurePrice(stripe, { ...PLANS.sub_standard, amountJpy: 5480 });
  assert.notEqual(changed.id, first.id);
  assert.equal(changed.unit_amount, 5480);
  assert.equal((await ensurePrice(stripe, { ...PLANS.sub_standard, amountJpy: 5480 })).id, changed.id);
});

test("チケットは一回払い（recurring なし）で作る", async () => {
  const { stripe } = fakeStripe();
  const p = await ensurePrice(stripe, PLANS.ticket_1);
  assert.equal(p.recurring, null);
  assert.equal(p.unit_amount, 800);
});

test("Webhook は同じ URL なら作り直さず、足りないイベントだけ追加する", async () => {
  const { stripe, endpoints } = fakeStripe();
  const url = "https://example.jp/api/webhooks/stripe";
  const created = await ensureWebhook(stripe, url);
  assert.equal(created.secret, "whsec_new");
  assert.equal((endpoints[0] as { api_version: string }).api_version, Stripe.API_VERSION);

  (endpoints[0] as { enabled_events: string[] }).enabled_events = ["checkout.session.completed"];
  const again = await ensureWebhook(stripe, url);
  assert.equal(again.id, created.id);
  assert.equal(again.secret, undefined);
  assert.equal(endpoints.length, 1);
  assert.deepEqual((endpoints[0] as { enabled_events: string[] }).enabled_events, WEBHOOK_EVENTS);
});
