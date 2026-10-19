import assert from "node:assert/strict";
import { test } from "node:test";
import { anthropic } from "../src/lib/anthropic";
import { buildQuestionBlock, runGrading, type QuestionForGrading } from "../src/lib/grading";

const question = {
  id: "sample-0-minpo", subjectLabel: "民法", sectionLabel: "民事系", problemText: "問題文", pageLimit: 4, timeLimitMin: 70,
  exam: { examType: "shihou", eraLabel: "令和7年" },
  materials: [{ kind: "intent", text: "出題趣旨の本文" }],
} as unknown as QuestionForGrading;

const graded = {
  overall: { rank: "C", summary: "s", scoreOutOf100: 55 },
  // わざと順番を崩して返させる
  criteria: ["expression", "doctrine", "reasoning", "coverage"].map((key) => ({
    key, label: "x", score: 5, strengths: [], issues: [], feedback: "f",
  })),
  redPens: [{ quote: "q", problem: "p", suggestion: "s", severity: "major" }],
  missedIssues: [],
  thinkingProcess: { steps: [{ title: "t", detail: "d" }], idealOutline: "o" },
  disclaimer: "d",
};

function mockResponse(name: string, input: unknown) {
  (anthropic.messages as unknown as { create: unknown }).create = async () => ({
    model: "m", stop_reason: "tool_use", usage: {},
    content: [{ type: "tool_use", id: "t", name, input }],
  });
}

test("問題ブロックに出題趣旨が入り、未公表の採点実感はその旨が入る", () => {
  const block = buildQuestionBlock(question);
  assert.match(block, /令和7年司法試験 論文式/);
  assert.match(block, /<intent>\n出題趣旨の本文/);
  assert.match(block, /<impression>\n（未公表）/);
});

test("採点結果は4本柱を決まった順・ラベルに並べ直して返す", async () => {
  mockResponse("submit_grading", graded);
  const { outcome } = await runGrading(question, "答案");
  assert.equal(outcome.kind, "graded");
  if (outcome.kind !== "graded") return;
  assert.deepEqual(outcome.result.criteria.map((c) => c.label),
    ["論点の網羅性", "法的論理思考", "規範の正確性・法的構成", "表現力・論述の構成力"]);
});

test("無関係な答案は mismatch で返る", async () => {
  mockResponse("reject_answer", { reason: "別の問題の答案です" });
  const { outcome } = await runGrading(question, "答案");
  assert.deepEqual(outcome, { kind: "mismatch", reason: "別の問題の答案です" });
});

test("スキーマに合わない出力はエラー（チケット返却側に回る）", async () => {
  mockResponse("submit_grading", { ...graded, criteria: graded.criteria.slice(0, 3) });
  await assert.rejects(runGrading(question, "答案"));
});
