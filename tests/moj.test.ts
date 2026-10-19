import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseAnswerTable } from "../scripts/moj/answers";
import { sectionSubjectOf } from "../scripts/moj/build-tanto";
import { segmentEssayText } from "../scripts/moj/essay";
import { joinWrappedLines } from "../scripts/moj/normalize";
import { parseQuestion, splitQuestions } from "../scripts/moj/tanto";
import { decompose, SourceTantoQuestion } from "../src/lib/tanto/decompose";

const DATA = join(__dirname, "..", "data");

test("PDF の行幅で折り返された行はつなぎ、見出しや箇条の行はつながない", () => {
  const full = "あ".repeat(30);
  const lines = [full, "いう。", full, "〔設問１〕", full, "ア．えお", "短い行", "次の行"];
  assert.deepEqual(joinWrappedLines([...lines, ...Array(5).fill(full)]).split("\n").slice(0, 6), [
    full + "いう。",
    full,
    "〔設問１〕",
    full,
    "ア．えお",
    "短い行",
  ]);
});

test("論文: 系科目の第N問と、選択科目の見出しで区間を分ける", () => {
  const raw = ["［公法系科目］", "〔第１問〕（配点：100）", "憲法の問題", "〔第２問〕（配点：100）", "行政法の問題", "［倒 産 法］", "〔第１問〕", "倒産法の問題"].join("\n");
  const seg = segmentEssayText(raw);
  assert.match(seg.get("公法系科目#1")!, /憲法の問題/);
  assert.match(seg.get("公法系科目#2")!, /行政法の問題/);
  assert.match(seg.get("tosan")!, /倒産法の問題/);
});

const tanto = (body: string) => parseQuestion(splitQuestions(body)[0]);

test("短答: 各肢の正誤を答える形式（№ の範囲表記）", () => {
  const q = tanto(
    [
      "〔第１問〕（配点：２）",
      "表現の自由に関する次のアからウまでの各記述について，それぞれ正しい場合には１を，誤っている場合には２を選びなさい。（解答欄は，アからウの順に［№１］から［№３］）",
      "ア．記述ア",
      "イ．記述イ",
      "ウ．記述ウ",
    ].join("\n"),
  );
  assert.equal(q.format, "each_tf");
  assert.deepEqual(q.nos, [1, 2, 3]);
  assert.deepEqual(q.statements.map((s) => s.label), ["ア", "イ", "ウ"]);
});

test("短答: 肢の組合せを選ぶ形式", () => {
  const q = tanto(
    [
      "〔第２問〕（配点：２）",
      "次のアからオまでの各記述のうち，誤っているものを組み合わせたものは，後記１から５までのうちどれか。（解答欄は，［№４］）",
      "ア．a", "イ．b", "ウ．c", "エ．d", "オ．e",
      "１．ア イ ２．ア エ ３．イ ウ ４．ウ オ ５．エ オ",
    ].join("\n"),
  );
  assert.equal(q.format, "combination");
  assert.equal(q.polarity, "incorrect");
  assert.deepEqual(q.choices!["4"], ["ウ", "オ"]);
  assert.deepEqual(q.nos, [4]);
});

test("短答: ○×の組合せを選ぶ形式", () => {
  const q = tanto(
    [
      "〔第３問〕（配点：３）",
      "次のアからウまでの各記述について，正しいものに○，誤っているものに×を付した場合の組合せを，後記１から４までの中から選びなさい。（解答欄は，［№５］）",
      "ア．a", "イ．b", "ウ．c",
      "１．ア○ イ○ ウ× ２．ア○ イ× ウ○ ３．ア× イ○ ウ○ ４．ア× イ× ウ×",
    ].join("\n"),
  );
  assert.equal(q.format, "tf_combination");
  assert.deepEqual(q.tfChoices!["2"], { ア: true, イ: false, ウ: true });
});

test("短答: 穴埋め・個数問題は一問一答にしない", () => {
  const q = tanto(["〔第４問〕", "次のアからオまでの各記述のうち，正しいものは幾つあるか。（解答欄は，［№６］）", "ア．a", "イ．b"].join("\n"));
  assert.equal(q.format, "other");
});

test("正解表: 「問」が複数の No にまたがる表から No ごとの正解を読む", () => {
  const cell = (str: string, x: number, y: number) => ({ str, x, y, w: 10, h: 10 });
  const items = [
    cell("問", 50, 100), cell("No", 80, 100), cell("解答", 110, 100),
    cell("1", 50, 130), cell("1", 80, 120), cell("2", 110, 120), cell("2", 80, 140), cell("1", 110, 140),
    cell("2", 50, 160), cell("3", 80, 160), cell("4", 110, 160),
  ];
  const t = parseAnswerTable([items]);
  assert.deepEqual([...t.answers], [[1, "2"], [2, "1"], [3, "4"]]);
});

test("司法試験 H23〜H26 の系の冊子: 通し番号から科目を決める", () => {
  assert.equal(sectionSubjectOf("公法系科目", 20, 40), "kenpo");
  assert.equal(sectionSubjectOf("公法系科目", 21, 40), "gyosei");
  assert.equal(sectionSubjectOf("民事系科目", 36, 74), "minpo");
  assert.equal(sectionSubjectOf("民事系科目", 37, 74), "shoho");
  assert.equal(sectionSubjectOf("民事系科目", 56, 74), "minso");
  assert.equal(sectionSubjectOf("民事系科目", 37, 75), "minpo");
});

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? jsonFiles(p) : n.endsWith(".json") ? [p] : [];
  });
}

test("取り込んだ短答の JSON はすべて検証を通り、肢の正誤を導出できる", () => {
  let n = 0;
  for (const f of jsonFiles(join(DATA, "tanto"))) {
    for (const q of JSON.parse(readFileSync(f, "utf8")).questions) {
      const parsed = SourceTantoQuestion.parse(q);
      assert.ok(decompose(parsed), `${f} 第${q.number}問`);
      n++;
    }
  }
  assert.ok(n > 1000);
});

test("取り込んだ論文の JSON には問題文と出典がある", () => {
  for (const f of jsonFiles(join(DATA, "past-exams")).filter((f) => !f.includes("sample"))) {
    const d = JSON.parse(readFileSync(f, "utf8"));
    assert.ok(d.problemText.length > 100, f);
    assert.match(d.sourceUrl, /^https:\/\/www\.moj\.go\.jp\/content\/\d+\.pdf$/, f);
    for (const m of d.materials) assert.match(m.sourceUrl, /^https:\/\/www\.moj\.go\.jp\//, f);
  }
});
