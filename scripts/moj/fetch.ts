/**
 * data/moj/manifest.json の PDF をすべて取得し、テキストを抽出しておく（.cache/moj）。
 *
 *   npx tsx scripts/moj/fetch.ts
 */
import { readFileSync } from "node:fs";
import type { ManifestEntry } from "./classify";
import { MANIFEST_PATH } from "./crawl";
import { pdfText } from "./text";

async function main() {
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  let failed = 0;
  for (const [i, e] of manifest.entries()) {
    try {
      const text = await pdfText(e.url);
      if (text.replace(/\s/g, "").length < 50) console.warn(`テキスト層がほぼない: ${e.url}`);
    } catch (err) {
      failed++;
      console.error(`${e.url}: ${(err as Error).message}`);
    }
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${manifest.length}`);
  }
  if (failed) process.exitCode = 1;
}

main();
