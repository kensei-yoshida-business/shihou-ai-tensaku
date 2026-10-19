"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PaywallDialog } from "./PaywallDialog";
import { PdfDropzone, type PdfExtracted } from "./PdfDropzone";
import { QuestionPicker, type QuestionOption } from "./QuestionPicker";
import { QuestionViewer } from "./QuestionViewer";

export type { QuestionOption };

const MIN_CHARS = 200;
const MAX_CHARS = 30000;

export function SubmitForm({
  questions,
  initialQuestionId,
  justPaid,
}: {
  questions: QuestionOption[];
  initialQuestionId?: string;
  justPaid: boolean;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionOption | null>(
    questions.find((q) => q.id === initialQuestionId) ?? questions[0] ?? null,
  );
  const [tab, setTab] = useState<"text" | "pdf">("text");
  const [answer, setAnswer] = useState("");
  const [source, setSource] = useState<"text" | "pdf">("text");
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [paidNotice, setPaidNotice] = useState(justPaid ? "決済を反映しています…" : null);

  // 決済直後は Webhook の到着まで数秒かかることがあるので、残数が増えるまで待つ
  useEffect(() => {
    if (!justPaid) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (me && (me.ticketBalance > 0 || me.subActive)) {
        setPaidNotice("決済が完了しました。添削を受けられます。");
        router.refresh();
        clearInterval(timer);
      } else if (tries >= 10) {
        setPaidNotice("決済の反映に時間がかかっています。少し待ってからページを再読み込みしてください。");
        clearInterval(timer);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [justPaid, router]);

  const chars = answer.trim().length;
  const canSubmit = !!question && chars >= MIN_CHARS && chars <= MAX_CHARS && !submitting;

  function onPdf(r: PdfExtracted, fileName: string) {
    setAnswer(r.text);
    setSource("pdf");
    setTab("text");
    setPdfNote(
      `${fileName}（${r.pages}ページ）を${r.method === "claude-ocr" ? "AIで文字起こし" : "読み取り"}しました。誤認識があれば修正してから送信してください。`,
    );
  }

  async function submit() {
    if (!question) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answerText: answer, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/reviews/${data.id}`);
        return;
      }
      if (res.status === 402) setPaywall(true);
      else if (res.status === 422)
        setError(`選択した過去問と答案が一致しないため添削しませんでした（チケットは消費していません）。${data.reason ?? ""}`);
      else if (res.status === 429)
        setError(`添削は1日${data.limit ?? ""}通までです。明日またご利用ください（チケットは消費していません）。`);
      else if (res.status === 401) router.push("/login?next=/submit");
      else setError("添削に失敗しました。チケットは消費していません。時間をおいて再度お試しください。");
    } catch {
      setError("通信に失敗しました。");
    }
    setSubmitting(false);
  }

  if (questions.length === 0) {
    return <p className="rounded-xl border border-line bg-white p-6 text-sm">公開中の過去問がまだありません。</p>;
  }

  return (
    <div className="space-y-6">
      {paidNotice && (
        <p className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">{paidNotice}</p>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">1. 過去問を選択</h2>
        <QuestionPicker questions={questions} value={question} onChange={setQuestion} />
        {question && <QuestionViewer questionId={question.id} />}
        <p className="text-xs text-muted">出題趣旨・採点実感は添削時に自動で参照し、結果画面で表示します。</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">2. 答案を入力</h2>
        <div className="flex gap-1 border-b border-line">
          {(
            [
              ["text", "テキスト入力"],
              ["pdf", "PDFアップロード"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm ${
                tab === key ? "border-brand font-medium text-brand" : "border-transparent text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "text" ? (
          <div>
            {pdfNote && <p className="mb-2 rounded-md bg-brand-soft px-3 py-2 text-xs text-brand">{pdfNote}</p>}
            <textarea
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                if (!e.target.value) {
                  setSource("text");
                  setPdfNote(null);
                }
              }}
              placeholder={"第1　設問1について\n1　……"}
              className="prose-answer h-[28rem] w-full resize-y rounded-xl border border-line bg-white p-4 text-[15px] outline-none focus:border-brand"
            />
            <p className={`mt-1 text-right text-xs ${chars > MAX_CHARS ? "text-redpen" : "text-muted"}`}>
              {chars.toLocaleString()}字{chars < MIN_CHARS && `（${MIN_CHARS}字以上で送信できます）`}
              {chars > MAX_CHARS && `（${MAX_CHARS.toLocaleString()}字までです）`}
            </p>
          </div>
        ) : (
          <PdfDropzone onExtracted={onPdf} />
        )}
      </section>

      {error && <p className="rounded-lg bg-redpen/10 px-4 py-3 text-sm text-redpen">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-brand px-6 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          添削する（チケット1枚）
        </button>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-white/85">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
          <p className="mt-4 font-medium">添削しています</p>
          <p className="mt-1 text-sm text-muted">出題趣旨・採点実感と照らし合わせています。1〜2分ほどかかります。</p>
        </div>
      )}

      {paywall && <PaywallDialog onClose={() => setPaywall(false)} />}
    </div>
  );
}
