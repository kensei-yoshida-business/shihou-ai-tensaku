import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";

export const TantoFilter = z.object({
  examType: z.enum(["shihou", "yobi", "sample"]).optional(),
  years: z.array(z.number().int()).optional(),
  subjects: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  // all: 未回答 → 直近誤答 → 正答済み の優先順 / unanswered: 未回答のみ / wrong: 直近で誤答した肢のみ
  mode: z.enum(["all", "unanswered", "wrong"]).default("all"),
});
export type TantoFilter = z.infer<typeof TantoFilter>;

/** URL のクエリから出題条件を読む（years/subjects/tags はカンマ区切り） */
export function parseFilter(params: URLSearchParams) {
  const list = (k: string) => params.get(k)?.split(",").map((s) => s.trim()).filter(Boolean);
  return TantoFilter.safeParse({
    examType: params.get("examType") ?? undefined,
    years: list("years")?.map(Number),
    subjects: list("subjects"),
    tags: list("tags"),
    mode: params.get("mode") ?? undefined,
  });
}

/** 肢ごとの直近の回答結果から優先度別に分ける（純粋関数・テスト対象） */
export function bucketize(
  candidateIds: string[],
  latest: Map<string, boolean>, // statementId → 直近の回答が正解だったか
) {
  const unanswered: string[] = [];
  const wrong: string[] = [];
  const right: string[] = [];
  for (const id of candidateIds) {
    const r = latest.get(id);
    if (r === undefined) unanswered.push(id);
    else if (r) right.push(id);
    else wrong.push(id);
  }
  return { unanswered, wrong, right };
}

export function pickNext(
  buckets: ReturnType<typeof bucketize>,
  mode: TantoFilter["mode"],
  excludeId?: string,
  random: () => number = Math.random,
): string | null {
  const order =
    mode === "unanswered" ? [buckets.unanswered]
    : mode === "wrong" ? [buckets.wrong]
    : [buckets.unanswered, buckets.wrong, buckets.right];
  for (const bucket of order) {
    // 直前に出した肢を連続で出さない（その肢しか残っていなければ出す）
    const pool = bucket.length > 1 ? bucket.filter((id) => id !== excludeId) : bucket;
    if (pool.length > 0) return pool[Math.floor(random() * pool.length)];
  }
  return null;
}

/** 出題条件に合う公開済みの肢から、次に出す1肢を選ぶ */
export async function selectNextStatement(userId: string, filter: TantoFilter, excludeId?: string) {
  const where: Prisma.TantoStatementWhereInput = {
    question: {
      published: true,
      subject: filter.subjects?.length ? { in: filter.subjects } : undefined,
      topicTags: filter.tags?.length ? { hasSome: filter.tags } : undefined,
      exam: {
        examType: filter.examType,
        year: filter.years?.length ? { in: filter.years } : undefined,
      },
    },
  };
  const candidates = await prisma.tantoStatement.findMany({ where, select: { id: true } });
  const candidateIds = candidates.map((c) => c.id);
  if (candidateIds.length === 0) return { statementId: null, total: 0, unanswered: 0, wrong: 0 };

  // 各肢の直近の回答だけを見る（distinct + createdAt desc）
  const attempts = await prisma.tantoAttempt.findMany({
    where: { userId, statementId: { in: candidateIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["statementId"],
    select: { statementId: true, correct: true },
  });
  const latest = new Map(attempts.map((a) => [a.statementId, a.correct]));
  const buckets = bucketize(candidateIds, latest);
  return {
    statementId: pickNext(buckets, filter.mode, excludeId),
    total: candidateIds.length,
    unanswered: buckets.unanswered.length,
    wrong: buckets.wrong.length,
  };
}
