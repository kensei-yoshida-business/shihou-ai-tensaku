import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/questions?examType=shihou&year=2025&subject=kenpo
// 公開済みの論文式過去問の一覧。出題趣旨・採点実感は返さない（答案作成前に見えないように）
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const examType = params.get("examType") ?? undefined;
  const year = params.get("year") ? Number(params.get("year")) : undefined;
  const subject = params.get("subject") ?? undefined;

  const questions = await prisma.question.findMany({
    where: { published: true, subject, exam: { examType, year } },
    select: {
      id: true,
      subject: true,
      subjectLabel: true,
      sectionLabel: true,
      exam: { select: { id: true, examType: true, year: true, eraLabel: true } },
    },
    orderBy: [{ exam: { year: "desc" } }, { id: "asc" }],
  });
  return NextResponse.json({ questions });
}
