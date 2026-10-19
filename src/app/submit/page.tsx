import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { SubmitForm, type QuestionOption } from "@/components/SubmitForm";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ q?: string; paid?: string }> }) {
  const { q, paid } = await searchParams;
  await requireUserId(q ? `/submit?q=${q}` : "/submit");

  const rows = await prisma.question.findMany({
    where: { published: true },
    select: {
      id: true,
      subjectLabel: true,
      sectionLabel: true,
      exam: { select: { examType: true, year: true, eraLabel: true } },
    },
    orderBy: [{ exam: { year: "desc" } }, { id: "asc" }],
  });
  const questions: QuestionOption[] = rows.map((r) => ({
    id: r.id,
    examType: r.exam.examType,
    year: r.exam.year,
    eraLabel: r.exam.eraLabel,
    subjectLabel: r.subjectLabel,
    sectionLabel: r.sectionLabel,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">論文式答案の添削</h1>
        <p className="mt-1 text-sm text-muted">
          過去問を選び、答案を入力するかPDFをアップロードしてください。添削1回につきチケット1枚（またはサブスクの月間枠）を使います。
        </p>
      </div>
      <SubmitForm questions={questions} initialQuestionId={q} justPaid={paid === "1"} />
    </div>
  );
}
