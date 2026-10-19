/**
 * 法務省サイトの「司法試験／予備試験の実施について」「…の結果について」から年度別ページをたどり、
 * 過去問に関係する PDF の一覧（data/moj/manifest.json）を作る。
 *
 *   npx tsx scripts/moj/crawl.ts [--refresh]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHtml, MOJ_ORIGIN } from "./http";
import { contentLinks, pageTitle } from "./html";
import { classify, ManifestEntry, parseEraYear, RawPdfLink } from "./classify";

const ROOTS = [
  { examType: "shihou", url: `${MOJ_ORIGIN}/jinji/shihoushiken/jinji08_00025.html` }, // 司法試験の実施について
  { examType: "shihou", url: `${MOJ_ORIGIN}/jinji/shihoushiken/jinji08_00026.html` }, // 司法試験の結果について
  { examType: "yobi", url: `${MOJ_ORIGIN}/jinji/shihoushiken/jinji07_00026.html` }, // 予備試験の実施について
  { examType: "yobi", url: `${MOJ_ORIGIN}/jinji/shihoushiken/jinji07_00027.html` }, // 予備試験の結果について
] as const;

const isPage = (href: string) => /^https:\/\/www\.moj\.go\.jp\/jinji\/shihoushiken\/jinji0[78]_\d+\.html$/.test(href);
const isPdf = (href: string) => /^https:\/\/www\.moj\.go\.jp\/content\/\d+\.pdf$/.test(href);

export const MANIFEST_PATH = join(__dirname, "..", "..", "data", "moj", "manifest.json");

async function main() {
  const refresh = process.argv.includes("--refresh");
  const raw: RawPdfLink[] = [];
  const rootUrls = new Set<string>(ROOTS.map((r) => r.url));

  for (const root of ROOTS) {
    const html = await getHtml(root.url, { refresh });
    if (!html) throw new Error(`${root.url} を取得できません`);
    for (const y of contentLinks(html, root.url)) {
      const year = parseEraYear(y.text);
      if (!year || !isPage(y.href)) continue;
      // 年度ページと、そこからリンクされた下位ページ（試験問題・短答式試験・採点実感など）を1段だけたどる
      const yearHtml = await getHtml(y.href, { refresh });
      if (!yearHtml) continue;
      const pages = [{ url: y.href, title: pageTitle(yearHtml), html: yearHtml }];
      for (const l of contentLinks(yearHtml, y.href)) {
        if (!isPage(l.href) || rootUrls.has(l.href) || pages.some((p) => p.url === l.href)) continue;
        const sub = await getHtml(l.href, { refresh });
        if (sub) pages.push({ url: l.href, title: pageTitle(sub), html: sub });
      }
      for (const p of pages) {
        for (const l of contentLinks(p.html, p.url)) {
          if (isPdf(l.href)) {
            raw.push({ examType: root.examType, year, pageUrl: p.url, pageTitle: p.title, headings: l.headings, text: l.text, url: l.href });
          }
        }
      }
      console.log(`${root.examType} ${year}: ${pages.length}ページ`);
    }
  }

  // 同じ PDF が複数ページから張られていることがあるので URL で一意にする（年度ページより下位ページの文脈を優先）
  const byUrl = new Map<string, RawPdfLink>();
  for (const r of raw) {
    const prev = byUrl.get(r.url);
    if (!prev || (prev.headings.length === 0 && r.headings.length > 0)) byUrl.set(r.url, r);
  }
  const previous = new Map<string, ManifestEntry>(
    existsSync(MANIFEST_PATH) ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ManifestEntry[]).map((e) => [e.url, e]) : [],
  );
  const today = new Date().toISOString().slice(0, 10);
  const entries: ManifestEntry[] = [];
  for (const r of byUrl.values()) {
    const e = classify(r);
    if (e) entries.push({ ...e, fetchedAt: previous.get(e.url)?.fetchedAt ?? today });
  }
  entries.sort((a, b) => a.examType.localeCompare(b.examType) || a.year - b.year || a.kind.localeCompare(b.kind) || a.url.localeCompare(b.url));
  mkdirSync(join(MANIFEST_PATH, ".."), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 1) + "\n");
  console.log(`${entries.length}件 → ${MANIFEST_PATH}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
