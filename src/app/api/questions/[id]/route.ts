import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

// GET /api/questions/:id  問題文の閲覧（出題趣旨・採点実感は含めない）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const question = await prisma.question.findFirst({
    where: { id, published: true },
    select: {
      id: true,
      subjectLabel: true,
      sectionLabel: true,
      problemText: true,
      sourceUrl: true,
      pageLimit: true,
      timeLimitMin: true,
      exam: { select: { examType: true, year: true, eraLabel: true } },
      materials: { select: { sourceUrl: true }, take: 1 },
    },
  });
  if (!question) return jsonError(404, "not_found");
  const { materials, ...rest } = question;
  return NextResponse.json({ question: { ...rest, sourceUrl: rest.sourceUrl ?? materials[0]?.sourceUrl ?? null } });
}
