import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tantoRemainingToday } from "@/lib/entitlements";
import { jsonError } from "@/lib/http";

const Body = z.object({
  statementId: z.string().min(1),
  answer: z.boolean(), // ○ なら true、× なら false
});

// POST /api/tanto/answer  回答を記録し、正誤・解説・元の問題全体を返す
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_input", { details: parsed.error.flatten() });
  const { statementId, answer } = parsed.data;

  const remainingToday = await tantoRemainingToday(userId);
  if (remainingToday === 0) return jsonError(402, "daily_limit_reached", { remainingToday });

  const s = await prisma.tantoStatement.findFirst({
    where: { id: statementId, question: { published: true } },
    include: {
      question: {
        select: {
          stem: true,
          officialAnswer: true,
          sourceUrl: true,
          statements: { select: { label: true, text: true, isCorrect: true }, orderBy: { label: "asc" } },
        },
      },
    },
  });
  if (!s) return jsonError(404, "not_found");

  const correct = answer === s.isCorrect;
  await prisma.tantoAttempt.create({ data: { userId, statementId, answer, correct } });

  return NextResponse.json({
    correct,
    isCorrect: s.isCorrect,
    explanation: s.explanation,
    explanationStatus: s.explanationStatus,
    lawChangeNote: s.lawChangeNote,
    originalQuestion: s.question,
    remainingToday: remainingToday === null ? null : remainingToday - 1,
  });
}
