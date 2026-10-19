"use client";

import { useState } from "react";
import type { PlanKey } from "@/lib/stripe";
import { startCheckout } from "./checkout";

export function PlanButton({ plan, label, disabled }: { plan: PlanKey; label: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError(await startCheckout(plan));
          setBusy(false);
        }}
        className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "決済画面へ移動中…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-redpen">{error}</p>}
    </div>
  );
}

export function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/billing-portal", { method: "POST" }).catch(() => null);
          const data = await res?.json().catch(() => ({}));
          if (res?.ok && data.url) window.location.href = data.url;
          else {
            setError(data?.message ?? "会員ページを開けませんでした。");
            setBusy(false);
          }
        }}
        className="rounded-md border border-line px-4 py-2 text-sm hover:bg-brand-soft disabled:opacity-50"
      >
        {busy ? "移動中…" : "プランの変更・解約・カード変更"}
      </button>
      {error && <p className="mt-2 text-xs text-redpen">{error}</p>}
    </div>
  );
}
