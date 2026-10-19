import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startOfTodayJst } from "@/lib/entitlements";
import { jsonError } from "@/lib/http";
import { extractAnswerText, PDF_MAX_BYTES, PdfError } from "@/lib/pdf";

export const maxDuration = 120; // 手書きPDFの文字起こしは時間がかかる

/** 文字起こしにも API 原価がかかるので、1日あたりの抽出回数を制限する */
const DAILY_EXTRACTION_LIMIT = 20;

// POST /api/extract-pdf  multipart/form-data の file を受け取り、答案テキストを返す（保存はしない）
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "unauthorized");

  const usedToday = await prisma.pdfExtraction.count({
    where: { userId, createdAt: { gte: startOfTodayJst() } },
  });
  if (usedToday >= DAILY_EXTRACTION_LIMIT) {
    return jsonError(429, "daily_limit_reached", { message: `PDFの読み取りは1日${DAILY_EXTRACTION_LIMIT}回までです` });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "file_required", { message: "PDFファイルを選択してください" });
  if (file.size > PDF_MAX_BYTES) return jsonError(413, "too_large", { message: "PDFは4MBまでです" });

  const buf = Buffer.from(await file.arrayBuffer());
  // 拡張子や Content-Type ではなく、ファイル先頭のシグネチャで PDF か判定する
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return jsonError(400, "not_pdf", { message: "PDFファイルではありません" });
  }

  try {
    const result = await extractAnswerText(buf);
    await prisma.pdfExtraction.create({ data: { userId, method: result.method, pages: result.pages } });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof PdfError) return jsonError(400, e.code, { message: e.message });
    console.error("pdf extraction failed", e);
    return jsonError(500, "extraction_failed", { message: "PDFの読み取りに失敗しました" });
  }
}
