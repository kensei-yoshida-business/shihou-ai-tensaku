import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlements";
import { PLANS } from "@/lib/stripe";
import { PlanButton } from "@/components/PlanButton";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const { canceled } = await searchParams;
  const userId = (await auth())?.user?.id;
  const subscribed = userId ? (await getEntitlement(userId)).subActive : false;
  const tickets = [PLANS.ticket_1, PLANS.ticket_5];
  const subs = [PLANS.sub_standard, PLANS.sub_unlimited];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-bold">料金プラン</h1>
        <p className="mt-1 text-sm text-muted">
          短答一問一答は無料で1日30問まで。論文添削はチケットまたは月額プランで利用できます。
        </p>
      </div>
      {canceled && <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm">決済はキャンセルされました。料金は発生していません。</p>}

      <section className="space-y-3">
        <h2 className="font-bold">都度払い（チケット）</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {tickets.map((p) => (
            <div key={p.key} className="flex flex-col rounded-2xl border border-line bg-white p-6">
              <p className="font-bold">{p.name}</p>
              <p className="mt-2 text-3xl font-bold text-brand">{p.priceLabel}</p>
              <p className="mt-2 flex-1 text-sm text-muted">{p.description}</p>
              <div className="mt-4">
                <PlanButton plan={p.key} label="購入する" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">月額プラン</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {subs.map((p) => (
            <div key={p.key} className="flex flex-col rounded-2xl border border-line bg-white p-6">
              <p className="font-bold">{p.name}</p>
              <p className="mt-2 text-3xl font-bold text-brand">{p.priceLabel}</p>
              <p className="mt-2 flex-1 text-sm text-muted">{p.description}</p>
              <div className="mt-4">
                <PlanButton plan={p.key} label={subscribed ? "登録済み（変更は会員情報から）" : "登録する"} disabled={subscribed} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">月額プランはいつでも解約でき、解約後も期間の終わりまで利用できます。</p>
      </section>
    </div>
  );
}
