"use client";

import Link from "next/link";
import { useState } from "react";
import { startCheckout } from "./checkout";

/** 残チケット0・サブスク枠切れで添削できないときの購入導線 */
export function PaywallDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(await startCheckout("ticket_1"));
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-lg font-bold">添削チケットがありません</h2>
        <p className="mt-2 text-sm text-muted">
          添削を受けるにはチケットの購入、または月額プランへの登録が必要です。入力した答案はこの画面に残っています。
        </p>
        <button
          onClick={buy}
          disabled={busy}
          className="mt-5 w-full rounded-md bg-brand px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {busy ? "決済画面へ移動中…" : "チケットを1通分購入する（800円）"}
        </button>
        <Link href="/pricing" className="mt-3 block text-center text-sm text-brand underline">
          5通パック・月額プランを見る
        </Link>
        {error && <p className="mt-3 text-sm text-redpen">{error}</p>}
        <button onClick={onClose} className="mt-4 w-full text-sm text-muted">
          閉じる
        </button>
      </div>
    </div>
  );
}
