/**
 * 取得済みの PDF テキストから data/past-exams（論文）と data/tanto（短答）の JSON を作る。
 * 既存の JSON で人が published を書き換えたものは、その値を引き継ぐ。
 *
 *   npx tsx scripts/moj/build.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ManifestEntry } from "./classify";
import { MANIFEST_PATH } from "./crawl";
import { parseAnswerTable, AnswerTable } from "./answers";
import { buildEssays } from "./build-essay";
import { buildTanto } from "./build-tanto";
import { pdfItems } from "./items";
import { pdfText } from "./text";

const DATA = join(__dirname, "..", "..", "data");
/** 画像だけでテキストのない正解表を人が書き起こしたもの。PDF の URL → { No: 正解 } */
const ANSWER_OVERRIDES = join(DATA, "moj", "answer-overrides.json");

function writeJson(path: string, value: object) {
  // 人が確認済み（_reviewed: true）のファイルは上書きしない
  if (existsSync(path)) {
    const prev = JSON.parse(readFileSync(path, "utf8"));
    if (prev._reviewed) return "kept";
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return "written";
}

async function main() {
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const texts = new Map<string, string>();
  for (const e of manifest) texts.set(e.url, await pdfText(e.url));

  const essays = buildEssays(manifest, texts);
  let pub = 0;
  for (const q of essays) {
    writeJson(join(DATA, "past-exams", q.examType, String(q.year), `${q.subject}.json`), q);
    if (q._autoChecked) pub++;
    else console.log(`論文 ${q.examType}-${q.year}-${q.subject}: 自動チェックで要確認（${q._warnings?.join("／")}）`);
  }
  console.log(`論文: ${essays.length}問（自動チェック通過 ${pub}）`);

  const overrides: Record<string, { answers: Record<string, string> }> = existsSync(ANSWER_OVERRIDES)
    ? JSON.parse(readFileSync(ANSWER_OVERRIDES, "utf8"))
    : {};
  const tables = new Map<string, AnswerTable>();
  for (const e of manifest) {
    if (e.kind !== "tanto_answer" || /一般教養/.test(e.text)) continue;
    const table = parseAnswerTable(await pdfItems(e.url));
    const o = overrides[e.url];
    if (o) for (const [no, v] of Object.entries(o.answers)) table.answers.set(Number(no), v);
    if (!table.answers.size) console.log(`短答 正解表を読み取れない: ${e.examType}-${e.year} ${e.text} ${e.url}`);
    tables.set(e.url, table);
  }
  let questions = 0;
  let statements = 0;
  for (const f of buildTanto(manifest, texts, tables)) {
    writeJson(join(DATA, "tanto", f.examType, String(f.year), `${f.subject}.json`), f);
    questions += f.questions.length;
    statements += f.questions.reduce((n, q) => n + q.statements.length, 0);
    console.log(`短答 ${f.examType}-${f.year}-${f.subject}: ${f.questions.length}問を収録、${f._skipped.length}問を除外`);
  }
  console.log(`短答: ${questions}問（${statements}肢）`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
