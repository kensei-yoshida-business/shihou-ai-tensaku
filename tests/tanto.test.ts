import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decompose, DecomposeError, SourceTantoQuestion } from "../src/lib/tanto/decompose";
import { bucketize, pickNext } from "../src/lib/tanto/selector";

const sample = JSON.parse(readFileSync(join(__dirname, "..", "data/tanto/sample/minpo.json"), "utf8"));
const truths = (q: unknown) =>
  Object.fromEntries(decompose(SourceTantoQuestion.parse(q))!.map((s) => [s.label, s.isCorrect]));

test("each_tf: 正解表の正誤がそのまま肢の正誤になる", () => {
  assert.deepEqual(truths(sample.questions[0]), { ア: true, イ: false, ウ: true, エ: false, オ: true });
});

test("combination(正しいもの): 正解の組合せの肢だけが○", () => {
  assert.deepEqual(truths(sample.questions[1]), { ア: false, イ: true, ウ: false, エ: true, オ: false });
});

test("combination(誤っているもの): 正解の組合せの肢だけが×", () => {
  const q = { ...sample.questions[1], polarity: "incorrect" };
  assert.deepEqual(truths(q), { ア: true, イ: false, ウ: true, エ: false, オ: true });
});

test("single_choice: 正解の肢だけが polarity 側", () => {
  const q = {
    number: 3, stem: "s", format: "single_choice", polarity: "incorrect", officialAnswer: "2",
    statements: [1, 2, 3].map((n) => ({ label: String(n), text: "t" })),
  };
  assert.deepEqual(truths(q), { "1": true, "2": false, "3": true });
});

test("other は一問一答にしない", () => {
  const q = SourceTantoQuestion.parse({
    number: 4, stem: "s", format: "other", officialAnswer: "3", statements: [{ label: "ア", text: "t" }],
  });
  assert.equal(decompose(q), null);
});

test("正解表と choices が食い違うとエラー", () => {
  const q = SourceTantoQuestion.parse({ ...sample.questions[1], officialAnswer: "9" });
  assert.throws(() => decompose(q), DecomposeError);
});

test("出題順: 未回答 → 直近誤答 → 正答済み", () => {
  const b = bucketize(["a", "b", "c"], new Map([["a", true], ["b", false]]));
  assert.deepEqual(b, { unanswered: ["c"], wrong: ["b"], right: ["a"] });
  assert.equal(pickNext(b, "all"), "c");
  assert.equal(pickNext({ ...b, unanswered: [] }, "all"), "b");
  assert.equal(pickNext(b, "wrong"), "b");
  assert.equal(pickNext({ unanswered: [], wrong: [], right: ["a"] }, "unanswered"), null);
});

test("直前の肢は他に候補があれば連続で出さない", () => {
  const b = { unanswered: ["x", "y"], wrong: [], right: [] };
  for (let i = 0; i < 20; i++) assert.equal(pickNext(b, "all", "x"), "y");
  assert.equal(pickNext({ unanswered: ["x"], wrong: [], right: [] }, "all", "x"), "x");
});
