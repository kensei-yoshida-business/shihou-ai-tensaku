import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tantoRemainingToday } from "@/lib/entitlements";
import { jsonError } from "@/lib/http";
import { parseFilter, selectNextStatement } from "@/lib/tanto/selector";

// GET /api/tanto/next?examType=shihou&years=2024,2025&subjects=minpo&mode=all&exclude=<直前の肢id>
// 次の1肢を返す。正誤と解説は回答するまで返さない
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const params = new URL(req.url).searchParams;
  const filter = parseFilter(params);
  if (!filter.success) return jsonError(400, "invalid_filter", { details: filter.error.flatten() });

  const remainingToday = await tantoRemainingToday(userId);
  if (remainingToday === 0) return jsonError(402, "daily_limit_reached", { remainingToday });

  const picked = await selectNextStatement(userId, filter.data, params.get("exclude") ?? undefined);
  const progress = { total: picked.total, unanswered: picked.unanswered, wrong: picked.wrong };
  if (!picked.statementId) return NextResponse.json({ statement: null, progress, remainingToday });

  const s = await prisma.tantoStatement.findUniqueOrThrow({
    where: { id: picked.statementId },
    select: {
      id: true,
      label: true,
      text: true,
      question: {
        select: {
          id: true,
          number: true,
          subjectLabel: true,
          topicTags: true,
          exam: { select: { examType: true, year: true, eraLabel: true } },
        },
      },
    },
  });
  return NextResponse.json({ statement: s, progress, remainingToday });
}
