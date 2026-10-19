import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REVIEW_DAILY_LIMIT, refundTicket, reserveReview } from "@/lib/entitlements";
import { runGrading } from "@/lib/grading";
import { jsonError } from "@/lib/http";

export const maxDuration = 300; // 添削は数十秒〜数分かかる

const Body = z.object({
  questionId: z.string().min(1), // 過去問IDのみ。問題文はクライアントから受け取らない
  answerText: z.string().trim().min(200).max(30000),
  source: z.enum(["text", "pdf"]),
});

// POST /api/reviews  論文式答案の添削を実行する
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_input", { details: parsed.error.flatten() });
  const { questionId, answerText, source } = parsed.data;

  const question = await prisma.question.findFirst({
    where: { id: questionId, published: true },
    include: { exam: true, materials: true },
  });
  if (!question) return jsonError(400, "unknown_question");

  const paidBy = await reserveReview(userId);
  if (paidBy === "payment_required") return jsonError(402, "payment_required");
  if (paidBy === "daily_limit") return jsonError(429, "daily_limit", { limit: REVIEW_DAILY_LIMIT });

  const review = await prisma.review.create({
    data: { userId, questionId, answerText, source, status: "running", paidBy },
  });

  try {
    const { outcome, model, usage } = await runGrading(question, answerText);
    const usageJson = JSON.parse(JSON.stringify(usage));

    if (outcome.kind === "mismatch") {
      await prisma.review.update({
        where: { id: review.id },
        data: { status: "rejected", result: { mismatch: outcome.reason }, model, usage: usageJson },
      });
      if (paidBy === "ticket") await refundTicket(userId, review.id, "refund_on_mismatch");
      return jsonError(422, "answer_question_mismatch", { reason: outcome.reason });
    }

    await prisma.review.update({
      where: { id: review.id },
      data: { status: "done", result: outcome.result, model, usage: usageJson },
    });
    return NextResponse.json({ id: review.id });
  } catch (err) {
    console.error("grading failed", review.id, err);
    await prisma.review.update({ where: { id: review.id }, data: { status: "error" } });
    if (paidBy === "ticket") await refundTicket(userId, review.id, "refund_on_error");
    return jsonError(500, "grading_failed");
  }
}

// GET /api/reviews  自分の添削履歴
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const reviews = await prisma.review.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      createdAt: true,
      result: true,
      question: {
        select: { subjectLabel: true, sectionLabel: true, exam: { select: { eraLabel: true, examType: true } } },
      },
    },
  });
  return NextResponse.json({
    reviews: reviews.map(({ result, ...r }) => ({
      ...r,
      rank: (result as { overall?: { rank?: string } } | null)?.overall?.rank ?? null,
    })),
  });
}
