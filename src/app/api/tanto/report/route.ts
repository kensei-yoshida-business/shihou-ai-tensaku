import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

const Body = z.object({ statementId: z.string().min(1) });

// POST /api/tanto/report  「解説に誤りがある」報告。件数が多い肢から人が確認する
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_input");

  const updated = await prisma.tantoStatement.updateMany({
    where: { id: parsed.data.statementId },
    data: { reportCount: { increment: 1 } },
  });
  if (updated.count === 0) return jsonError(404, "not_found");
  return NextResponse.json({ ok: true });
}
