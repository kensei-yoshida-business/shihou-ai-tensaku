import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

// GET /api/reviews/:id  添削結果。ここで初めて出題趣旨・採点実感を開示する
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");
  const { id } = await params;

  const review = await prisma.review.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      answerText: true,
      result: true,
      createdAt: true,
      question: {
        select: {
          id: true,
          subjectLabel: true,
          sectionLabel: true,
          problemText: true,
          exam: { select: { eraLabel: true, examType: true } },
          materials: { select: { kind: true, text: true, sourceUrl: true } },
        },
      },
    },
  });
  if (!review) return jsonError(404, "not_found");
  return NextResponse.json({ review });
}
