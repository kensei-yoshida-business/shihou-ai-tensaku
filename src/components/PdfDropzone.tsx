"use client";

import { useRef, useState } from "react";

export type PdfExtracted = { text: string; method: "text-layer" | "claude-ocr"; pages: number };

/** 答案PDFを /api/extract-pdf に送ってテキストにする。添削のチケットは消費しない */
export function PdfDropzone({ onExtracted }: { onExtracted: (r: PdfExtracted, fileName: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.type && file.type !== "application/pdf") {
      setError("PDFファイルを選択してください");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("PDFは4MBまでです。スキャンの解像度を下げて保存し直してください");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract-pdf", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "PDFの読み取りに失敗しました");
      if (!data.text?.trim()) throw new Error("PDFから文字を読み取れませんでした");
      onExtracted(data, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDFの読み取りに失敗しました");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && !busy) upload(f);
        }}
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition ${
          dragging ? "border-brand bg-brand-soft" : "border-line bg-white hover:bg-brand-soft/50"
        }`}
      >
        {busy ? (
          <>
            <p className="font-medium">PDFを読み取っています…</p>
            <p className="mt-1 text-xs text-muted">手書き答案の場合は1分ほどかかることがあります</p>
          </>
        ) : (
          <>
            <p className="font-medium">答案PDFをここにドロップ、またはクリックして選択</p>
            <p className="mt-1 text-xs text-muted">
              4MB・30ページまで。手書きのスキャンにも対応します。読み取った文章は送信前に修正できます。
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>
      {error && <p className="mt-2 text-sm text-redpen">{error}</p>}
    </div>
  );
}
