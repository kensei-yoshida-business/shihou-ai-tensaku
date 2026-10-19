import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getEntitlement, tantoRemainingToday } from "@/lib/entitlements";
import { jsonError } from "@/lib/http";

// GET /api/me  残チケット・サブスク状態（決済直後の反映待ちポーリングにも使う）
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");
  const [e, tantoRemaining] = await Promise.all([getEntitlement(userId), tantoRemainingToday(userId)]);
  return NextResponse.json({ ...e, tantoRemainingToday: tantoRemaining });
}
