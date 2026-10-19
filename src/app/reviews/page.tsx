import Link from "next/link";
import { prisma } from "@/lib/db";
import { examTitle } from "@/lib/labels";
import { requireUserId } from "@/lib/session";

const STATUS: Record<string, string> = { running: "添削中", error: "失敗（返却済み）", rejected: "差し戻し（返却済み）" };

export default async function ReviewsPage() {
  const userId = await requireUserId("/reviews");
  const reviews = await prisma.review.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { question: { include: { exam: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">添削履歴</h1>
      {reviews.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm">
          まだ添削履歴がありません。
          <Link href="/submit" className="ml-2 text-brand underline">
            答案を提出する
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {reviews.map((r) => {
            const rank = (r.result as { overall?: { rank?: string } } | null)?.overall?.rank;
            return (
              <li key={r.id}>
                <Link href={`/reviews/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-brand-soft/40">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-serif text-lg font-bold text-brand">
                    {r.status === "done" ? rank : "—"}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">
                      {examTitle(r.question.exam)} {r.question.subjectLabel}
                    </span>
                    <span className="text-xs text-muted">
                      {r.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      {STATUS[r.status] ? ` ・ ${STATUS[r.status]}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
