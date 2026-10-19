"use client";

import { useEffect, useState } from "react";

type Detail = {
  problemText: string;
  pageLimit: number | null;
  timeLimitMin: number | null;
  sourceUrl: string | null;
};

/** 選択中の過去問の問題文（読み取り専用・折りたたみ）。出題趣旨・採点実感はここでは出さない */
export function QuestionViewer({ questionId }: { questionId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(false);
    fetch(`/api/questions/${encodeURIComponent(questionId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setDetail(d.question))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  if (error) return <p className="text-sm text-redpen">問題文を読み込めませんでした。</p>;
  if (!detail) return <p className="text-sm text-muted">問題文を読み込み中…</p>;

  return (
    <details className="rounded-xl border border-line bg-white" open>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        問題文を表示
        <span className="ml-3 text-xs font-normal text-muted">
          {detail.pageLimit ? `答案用紙 ${detail.pageLimit}枚` : ""}
          {detail.timeLimitMin ? ` ／ 試験時間 ${detail.timeLimitMin}分` : ""}
        </span>
      </summary>
      <div className="max-h-96 overflow-y-auto border-t border-line px-4 py-4">
        <p className="prose-answer text-sm">{detail.problemText}</p>
        {detail.sourceUrl && (
          <p className="mt-4 text-xs text-muted">
            出典:{" "}
            <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="underline">
              法務省ウェブサイト
            </a>
          </p>
        )}
      </div>
    </details>
  );
}
