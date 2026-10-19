import type { PlanKey } from "@/lib/stripe";

/** Checkout セッションを作って Stripe の決済画面へ移動する。失敗時はエラーメッセージを返す */
export async function startCheckout(plan: PlanKey): Promise<string | null> {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) return data.message ?? "決済画面を開けませんでした。時間をおいて再度お試しください。";
    window.location.href = data.url;
    return null;
  } catch {
    return "通信に失敗しました。";
  }
}
