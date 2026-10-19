import { prisma } from "@/lib/db";
import { tantoRemainingToday } from "@/lib/entitlements";
import { requireUserId } from "@/lib/session";
import { TantoFilterForm, type TantoOptions } from "@/components/tanto/TantoFilterForm";

type SubjectStat = { subjectLabel: string; answered: bigint; correct: bigint; total: bigint };

export default async function TantoPage() {
  const userId = await requireUserId("/tanto");

  const questions = await prisma.tantoQuestion.findMany({
    where: { published: true },
    select: { subject: true, subjectLabel: true, exam: { select: { examType: true, year: true, eraLabel: true } } },
  });
  const options: TantoOptions = {
    exams: [...new Map(questions.map((q) => [`${q.exam.examType}-${q.exam.year}`, q.exam])).values()].sort(
      (a, b) => b.year - a.year,
    ),
    subjects: [...new Map(questions.map((q) => [q.subject, q.subjectLabel])).entries()].map(([value, label]) => ({
      value,
      label,
    })),
  };

  // 科目ごとの進み具合（各肢の直近の回答で正誤を数える）
  const stats = await prisma.$queryRaw<SubjectStat[]>`
    WITH latest AS (
      SELECT DISTINCT ON (a."statementId") a."statementId", a.correct
      FROM "TantoAttempt" a WHERE a."userId" = ${userId}
      ORDER BY a."statementId", a."createdAt" DESC
    )
    SELECT q."subjectLabel",
           COUNT(l."statementId") AS answered,
           COUNT(*) FILTER (WHERE l.correct) AS correct,
           COUNT(*) AS total
    FROM "TantoStatement" s
    JOIN "TantoQuestion" q ON q.id = s."questionId" AND q.published
    LEFT JOIN latest l ON l."statementId" = s.id
    GROUP BY q."subjectLabel"
    ORDER BY q."subjectLabel"`;
  const remaining = await tantoRemainingToday(userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">短答式 一問一答</h1>
        <p className="mt-1 text-sm text-muted">
          司法試験・予備試験の短答式過去問を、肢ごとの○×で解きます。正誤は法務省の正解表に基づきます。
          {remaining !== null && ` 本日あと${remaining}問解けます。`}
        </p>
      </div>

      {stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => {
            const answered = Number(s.answered);
            const rate = answered ? Math.round((Number(s.correct) / answered) * 100) : null;
            return (
              <div key={s.subjectLabel} className="rounded-xl border border-line bg-white p-4">
                <p className="text-sm font-bold">{s.subjectLabel}</p>
                <p className="mt-1 text-xs text-muted">
                  {answered} / {Number(s.total)} 肢 解答済み
                </p>
                <p className="mt-2 text-2xl font-bold text-brand">{rate === null ? "—" : `${rate}%`}</p>
                <p className="text-xs text-muted">直近の正答率</p>
              </div>
            );
          })}
        </div>
      )}

      <TantoFilterForm options={options} />
    </div>
  );
}
