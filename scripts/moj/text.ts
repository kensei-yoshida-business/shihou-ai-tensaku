import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR } from "./http";
import { itemsToText, pdfItems } from "./items";

/** PDF を取得してテキストを抽出する（結果は .cache/moj/text に保存）。ページ区切りは \f */
export async function pdfText(url: string): Promise<string> {
  const id = url.split("/").pop()!.replace(/\.pdf$/, "");
  const out = join(CACHE_DIR, "text", `${id}.txt`);
  if (existsSync(out)) return readFileSync(out, "utf8");
  const text = itemsToText(await pdfItems(url));
  mkdirSync(join(CACHE_DIR, "text"), { recursive: true });
  writeFileSync(out, text);
  return text;
}
