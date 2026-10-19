import { PDFParse } from "pdf-parse";
import { anthropic, GRADING_MODEL } from "./anthropic";

// Vercel の関数はリクエスト本体が4.5MBまでなので、余裕をみて4MBに制限する
export const PDF_MAX_BYTES = 4 * 1024 * 1024;
export const PDF_MAX_PAGES = 30;
/** 1ページあたりこれ未満の文字しか取れなければ、手書きスキャン等の画像PDFとみなす */
const MIN_CHARS_PER_PAGE = 50;

export type ExtractResult = { text: string; method: "text-layer" | "claude-ocr"; pages: number };

export class PdfError extends Error {
  constructor(public code: "invalid_pdf" | "too_many_pages", message: string) {
    super(message);
  }
}

/** pdf-parse がページ境界に入れる「-- 1 of 3 --」などの区切りと余分な空白を除く */
export function cleanExtractedText(raw: string): string {
  return raw
    .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, "")
    .replace(/[ \t　]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksScanned(text: string, pages: number): boolean {
  const chars = text.replace(/\s/g, "").length;
  return chars < MIN_CHARS_PER_PAGE * Math.max(1, pages);
}

/**
 * 答案PDFからテキストを取り出す。
 * 1. テキスト層があれば pdf-parse で抽出（無料・高速）
 * 2. 手書きスキャンなどテキスト層がなければ、Claude に PDF を読ませて文字起こし
 */
export async function extractAnswerText(buf: Buffer): Promise<ExtractResult> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  let pages: number;
  let text = "";
  try {
    const info = await parser.getInfo();
    pages = info.total;
    if (pages > PDF_MAX_PAGES) {
      throw new PdfError("too_many_pages", `PDFは${PDF_MAX_PAGES}ページまでです（${pages}ページ）`);
    }
    text = cleanExtractedText((await parser.getText()).text);
  } catch (e) {
    if (e instanceof PdfError) throw e;
    throw new PdfError("invalid_pdf", "PDFを読み込めませんでした");
  } finally {
    await parser.destroy();
  }

  if (!looksScanned(text, pages)) return { text, method: "text-layer", pages };
  return { text: await transcribeWithClaude(buf), method: "claude-ocr", pages };
}

async function transcribeWithClaude(buf: Buffer): Promise<string> {
  const res = await anthropic.messages.create({
    model: GRADING_MODEL,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
          },
          {
            type: "text",
            text:
              "これは司法試験・予備試験の論文式答案です。書かれている文字を一字一句そのまま文字起こししてください。\n" +
              "- 誤字・脱字や論理の誤りも直さないでください。\n" +
              "- 判読できない文字は〓で示してください。\n" +
              "- 改行と見出し番号（第1、1、(1)、ア など）は原文どおり保ってください。\n" +
              "- 文字起こし本文以外（前置きや注釈）は出力しないでください。",
          },
        ],
      },
    ],
  });
  if (res.stop_reason === "max_tokens") throw new Error("transcription truncated");
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
