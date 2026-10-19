"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { examTitle } from "@/lib/labels";

type Statement = {
  id: string;
  label: string;
  text: string;
  question: {
    number: number;
    subjectLabel: string;
    topicTags: string[];
    exam: { examType: string; year: number; eraLabel: string };
  };
};

type Progress = { total: number; unanswered: number; wrong: number };

type AnswerResult = {
  correct: boolean;
  isCorrect: boolean;
  explanation: string | null;
  explanationStatus: string;
  lawChangeNote: string | null;
  originalQuestion: {
    stem: string;
    officialAnswer: string;
    sourceUrl: string;
    statements: { label: string; text: string; isCorrect: boolean }[];
  };
};

type State =
  | { kind: "loading" }
  | { kind: "question"; s: Statement }
  | { kind: "answered"; s: Statement; mine: boolean; r: AnswerResult }
  | { kind: "done" }
  | { kind: "limit" }
  | { kind: "error"; message: string };

const mark = (b: boolean) => (b ? "○" : "×");

export function TantoPlayer({ query }: { query: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [score, setScore] = useState({ answered: 0, correct: 0 });
  const [reported, setReported] = useState(false);

  const loadNext = useCallback(
    async (excludeId?: string) => {
      setState({ kind: "loading" });
      setReported(false);
      const p = new URLSearchParams(query);
      if (excludeId) p.set("exclude", excludeId);
      const res = await fetch(`/api/tanto/next?${p}`).catch(() => null);
      if (!res) return setState({ kind: "error", message: "通信に失敗しました。" });
      if (res.status === 402) return setState({ kind: "limit" });
      if (!res.ok) return setState({ kind: "error", message: "問題を読み込めませんでした。" });
      const data = await res.json();
      setProgress(data.progress);
      setRemaining(data.remainingToday);
      setState(data.statement ? { kind: "question", s: data.statement } : { kind: "done" });
    },
    [query],
  );

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  async function answer(s: Statement, mine: boolean) {
    const res = await fetch("/api/tanto/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statementId: s.id, answer: mine }),
    }).catch(() => null);
    if (res?.status === 402) return setState({ kind: "limit" });
    if (!res?.ok) return setState({ kind: "error", message: "回答を記録できませんでした。" });
    const r: AnswerResult & { remainingToday: number | null } = await res.json();
    setRemaining(r.remainingToday);
    setScore((x) => ({ answered: x.answered + 1, correct: x.correct + (r.correct ? 1 : 0) }));
    setState({ kind: "answered", s, mine, r });
  }

  // キーボード操作: O / X で回答、Enter で次へ
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (state.kind === "question") {
        if (e.key === "o" || e.key === "O" || e.key === "1") answer(state.s, true);
        if (e.key === "x" || e.key === "X" || e.key === "2") answer(state.s, false);
      } else if (state.kind === "answered" && e.key === "Enter") {
        loadNext(state.s.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function report(id: string) {
    setReported(true);
    await fetch("/api/tanto/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statementId: id }),
    }).catch(() => null);
  }

  const topBar = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <Link href="/tanto" className="underline">
        ← 出題条件を変える
      </Link>
      <span>
        この回 {score.correct}/{score.answered} 正解
        {progress && ` ・ 未回答 ${progress.unanswered} ／ 要復習 ${progress.wrong} ／ 全 ${progress.total} 肢`}
        {remaining !== null && ` ・ 本日あと ${remaining} 問`}
      </span>
    </div>
  );

  if (state.kind === "loading") return <div className="space-y-4">{topBar}<p className="text-sm text-muted">読み込み中…</p></div>;
  if (state.kind === "error") return <div className="space-y-4">{topBar}<p className="text-sm text-redpen">{state.message}</p></div>;
  if (state.kind === "done")
    return (
      <div className="space-y-4">
        {topBar}
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <p className="font-bold">この条件の問題はすべて解き終わりました</p>
          <Link href="/tanto" className="mt-3 inline-block text-sm text-brand underline">
            出題条件を変える
          </Link>
        </div>
      </div>
    );
  if (state.kind === "limit")
    return (
      <div className="space-y-4">
        {topBar}
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <p className="font-bold">本日の無料枠（30問）を使い切りました</p>
          <p className="mt-2 text-sm text-muted">月額プランまたは添削チケットの購入で、一問一答が無制限になります。</p>
          <Link href="/pricing" className="mt-4 inline-block rounded-md bg-brand px-5 py-2 text-sm font-medium text-white">
            料金プランを見る
          </Link>
        </div>
      </div>
    );

  const s = state.s;
  const q = s.question;

  return (
    <div className="space-y-4">
      {topBar}
      <article className="rounded-2xl border border-line bg-white">
        <header className="border-b border-line px-6 py-3 text-sm">
          <span className="font-medium">
            {examTitle(q.exam)} 短答式 {q.subjectLabel} 第{q.number}問 肢{s.label}
          </span>
          {q.topicTags.length > 0 && <span className="ml-3 text-xs text-muted">分野: {q.topicTags.join("・")}</span>}
        </header>
        <p className="prose-answer px-6 py-8 text-lg">{s.text}</p>

        {state.kind === "question" ? (
          <div className="grid grid-cols-2 gap-4 px-6 pb-6">
            <button
              onClick={() => answer(s, true)}
              className="rounded-xl border-2 border-ok/40 py-5 text-4xl font-bold text-ok hover:bg-ok/10"
              aria-label="正しい（○）"
            >
              ○
            </button>
            <button
              onClick={() => answer(s, false)}
              className="rounded-xl border-2 border-redpen/40 py-5 text-4xl font-bold text-redpen hover:bg-redpen/10"
              aria-label="誤り（×）"
            >
              ×
            </button>
            <p className="col-span-2 text-center text-xs text-muted">キーボード: O で○、X で×</p>
          </div>
        ) : (
          <div className="space-y-4 border-t border-line px-6 py-5">
            <div className={`flex items-center gap-3 text-lg font-bold ${state.r.correct ? "text-ok" : "text-redpen"}`}>
              <span className="text-3xl">{state.r.correct ? "✔" : "✘"}</span>
              {state.r.correct ? "正解" : "不正解"}
              <span className="text-sm font-normal text-muted">
                正解 {mark(state.r.isCorrect)} ／ あなたの回答 {mark(state.mine)}
              </span>
            </div>

            {state.r.lawChangeNote && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ 法改正の注意: {state.r.lawChangeNote}</p>
            )}

            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-bold text-muted">
                解説{state.r.explanationStatus === "ai_generated" && "（AI生成）"}
              </p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                {state.r.explanation ?? "この肢の解説は準備中です。"}
              </p>
            </div>

            <details className="rounded-xl border border-line">
              <summary className="cursor-pointer px-4 py-2 text-sm">元の問題全体を見る</summary>
              <div className="space-y-2 border-t border-line px-4 py-3 text-sm">
                <p className="prose-answer">{state.r.originalQuestion.stem}</p>
                <ul className="space-y-1">
                  {state.r.originalQuestion.statements.map((x) => (
                    <li key={x.label} className={`flex gap-2 ${x.label === s.label ? "font-bold" : ""}`}>
                      <span className={x.isCorrect ? "text-ok" : "text-redpen"}>{mark(x.isCorrect)}</span>
                      <span>
                        {x.label} {x.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">
                  正解: {state.r.originalQuestion.officialAnswer} ／{" "}
                  <a href={state.r.originalQuestion.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                    出典
                  </a>
                </p>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => report(s.id)}
                disabled={reported}
                className="text-xs text-muted underline disabled:no-underline"
              >
                {reported ? "報告を受け付けました" : "解説の誤りを報告"}
              </button>
              <button onClick={() => loadNext(s.id)} className="rounded-md bg-brand px-6 py-2.5 font-medium text-white">
                次へ（Enter）
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
