/**
 * 原本の PDF と照合し終えた過去問を公開する。照合した年度・科目を指定して実行する。
 * 公開したファイルには _reviewed: true を付け、以後の再取り込み（build.ts）で上書きされないようにする。
 *
 *   npx tsx scripts/moj/publish.ts past-exams shihou 2025            # 論文 令和7年司法試験の全科目
 *   npx tsx scripts/moj/publish.ts tanto yobi 2025 minpo             # 短答 令和7年予備試験の民法
 *
 * 論文は自動チェック（_autoChecked）を通っていないファイルを公開しない。直したうえで _autoChecked を true にしてから実行する。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [kind, examType, year, subject] = process.argv.slice(2);
if (!["past-exams", "tanto"].includes(kind) || !["shihou", "yobi"].includes(examType) || !/^\d{4}$/.test(year ?? "")) {
  console.error("使い方: publish.ts <past-exams|tanto> <shihou|yobi> <西暦> [科目]");
  process.exit(1);
}

const dir = join(__dirname, "..", "..", "data", kind, examType, year);
if (!existsSync(dir)) {
  console.error(`${dir} がありません`);
  process.exit(1);
}
for (const name of readdirSync(dir).filter((n) => n.endsWith(".json") && (!subject || n === `${subject}.json`))) {
  const path = join(dir, name);
  const d = JSON.parse(readFileSync(path, "utf8"));
  if (kind === "past-exams") {
    if (!d._autoChecked) {
      console.log(`公開しない: ${name}（${(d._warnings ?? []).join("／")}）`);
      continue;
    }
    d.published = true;
  } else {
    for (const q of d.questions) q.published = true;
  }
  d._reviewed = true;
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
  console.log(`公開: ${kind}/${examType}/${year}/${name}`);
}
