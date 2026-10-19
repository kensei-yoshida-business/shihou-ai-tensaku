import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { examTitle } from "@/lib/labels";
import { SourceNote } from "@/components/SourceNote";
import { requireUserId } from "@/lib/session";
import { GradingResultSchema } from "@/types/review";
import { CriteriaSection } from "@/components/review/CriteriaSection";
import { OverallCard } from "@/components/review/OverallCard";
import { RedPenList } from "@/components/review/RedPenList";
import { ThinkingProcess } from "@/components/review/ThinkingProcess";

const MATERIAL_LABEL: Record<string, string> = {
  intent: "出題趣旨",
  impression: "採点実感",
  grading_policy: "採点方針",
};

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId(`/reviews/${id}`);

  const review = await prisma.review.findFirst({
    where: { id, userId },
    include: { question: { include: { exam: true, materials: true } } },
  });
  if (!review) notFound();
  const q = review.question;

  const header = (
    <div>
      <p className="text-sm text-muted">
        {examTitle(q.exam)} 論文式 ／ {q.sectionLabel}
      </p>
      <h1 className="font-serif text-2xl font-bold">{q.subjectLabel} 添削結果</h1>
      <p className="mt-1 text-xs text-muted">{review.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
    </div>
  );

  if (review.status !== "done") {
    const message =
      review.status === "running"
        ? "添削中です。しばらくしてから再読み込みしてください。"
        : review.status === "rejected"
          ? "選択した過去問と答案が一致しなかったため、添削しませんでした。チケットは返却済みです。"
          : "添削に失敗しました。チケットは返却済みです。";
    return (
      <div className="space-y-6">
        {header}
        <p className="rounded-xl border border-line bg-white p-6 text-sm">{message}</p>
        <Link href={`/submit?q=${q.id}`} className="text-sm text-brand underline">
          もう一度提出する
        </Link>
      </div>
    );
  }

  const parsed = GradingResultSchema.safeParse(review.result);
  if (!parsed.success) notFound();
  const result = parsed.data;

  return (
    <div className="space-y-8">
      {header}
      <OverallCard result={result} />
      <CriteriaSection result={result} />
      <RedPenList result={result} />
      <ThinkingProcess result={result} />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-muted">📄 参照資料と提出答案</h2>
        {[...q.materials]
          .sort((a, b) => Object.keys(MATERIAL_LABEL).indexOf(a.kind) - Object.keys(MATERIAL_LABEL).indexOf(b.kind))
          .map((m) => (
            <details key={m.id} className="rounded-xl border border-line bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{MATERIAL_LABEL[m.kind] ?? m.kind}</summary>
              <div className="border-t border-line px-4 py-4">
                <p className="prose-answer text-sm">{m.text}</p>
                <SourceNote url={m.sourceUrl} className="mt-3" />
              </div>
            </details>
          ))}
        <details className="rounded-xl border border-line bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">問題文</summary>
          <div className="border-t border-line px-4 py-4">
            <p className="prose-answer text-sm">{q.problemText}</p>
            {q.sourceUrl && <SourceNote url={q.sourceUrl} className="mt-3" />}
          </div>
        </details>
        <details className="rounded-xl border border-line bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">提出した答案</summary>
          <p className="prose-answer border-t border-line px-4 py-4 text-sm">{review.answerText}</p>
        </details>
      </section>

      <p className="text-xs text-muted">{result.disclaimer}</p>
      <div className="flex gap-4 text-sm">
        <Link href={`/submit?q=${q.id}`} className="text-brand underline">
          書き直して再提出する
        </Link>
        <Link href="/reviews" className="text-muted underline">
          添削履歴へ
        </Link>
      </div>
    </div>
  );
}
