import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { anthropic, GRADING_MODEL } from "./anthropic";
import { GRADING_SYSTEM_PROMPT } from "./prompts/grading";
import { CRITERIA, GradingResultSchema, RANKS, type GradingOutcome } from "@/types/review";

export type QuestionForGrading = Prisma.QuestionGetPayload<{
  include: { exam: true; materials: true };
}>;

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;

const submitGradingTool: Anthropic.Tool = {
  name: "submit_grading",
  description: "答案の採点・添削結果を提出する",
  input_schema: {
    type: "object",
    required: ["overall", "criteria", "redPens", "missedIssues", "thinkingProcess", "disclaimer"],
    properties: {
      overall: {
        type: "object",
        required: ["rank", "summary", "scoreOutOf100"],
        properties: {
          rank: { type: "string", enum: [...RANKS] },
          summary: str,
          scoreOutOf100: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      criteria: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          required: ["key", "label", "score", "strengths", "issues", "feedback"],
          properties: {
            key: { type: "string", enum: CRITERIA.map((c) => c.key) },
            label: str,
            score: { type: "integer", minimum: 1, maximum: 10 },
            strengths: strArr,
            issues: strArr,
            feedback: str,
          },
        },
      },
      redPens: {
        type: "array",
        items: {
          type: "object",
          required: ["quote", "problem", "suggestion", "severity"],
          properties: {
            quote: str,
            problem: str,
            suggestion: str,
            severity: { type: "string", enum: ["critical", "major", "minor"] },
          },
        },
      },
      missedIssues: strArr,
      thinkingProcess: {
        type: "object",
        required: ["steps", "idealOutline"],
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "detail"],
              properties: { title: str, detail: str },
            },
          },
          idealOutline: str,
        },
      },
      disclaimer: str,
    },
  },
};

const rejectAnswerTool: Anthropic.Tool = {
  name: "reject_answer",
  description: "答案が指定された過去問に対するものでない場合に、採点せず理由を返す",
  input_schema: {
    type: "object",
    required: ["reason"],
    properties: { reason: str },
  },
};

/** 過去問ごとに固定の部分。同じ過去問の2通目以降は prompt caching が効く */
export function buildQuestionBlock(q: QuestionForGrading): string {
  const examName = q.exam.examType === "yobi" ? "司法試験予備試験" : "司法試験";
  const material = (kind: string) => q.materials.find((m) => m.kind === kind)?.text;
  return [
    `<exam>${q.exam.eraLabel}${examName} 論文式 ${q.sectionLabel}（${q.subjectLabel}）</exam>`,
    `<limits>答案用紙 ${q.pageLimit ?? "不明"} 枚 / 試験時間 ${q.timeLimitMin ?? "不明"} 分</limits>`,
    `<problem>\n${q.problemText}\n</problem>`,
    `<intent>\n${material("intent") ?? "（未公表）"}\n</intent>`,
    `<impression>\n${material("impression") ?? "（未公表）"}\n</impression>`,
  ].join("\n\n");
}

export async function runGrading(
  q: QuestionForGrading,
  answerText: string,
): Promise<{ outcome: GradingOutcome; model: string; usage: Anthropic.Usage }> {
  const res = await anthropic.messages.create({
    model: GRADING_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: GRADING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [submitGradingTool, rejectAnswerTool],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildQuestionBlock(q), cache_control: { type: "ephemeral" } },
          { type: "text", text: `<answer>\n${answerText}\n</answer>` },
        ],
      },
    ],
  });

  if (res.stop_reason === "max_tokens") throw new Error("grading output truncated");
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("no tool call in grading response");

  if (block.name === "reject_answer") {
    const reason = String((block.input as { reason?: unknown }).reason ?? "");
    return { outcome: { kind: "mismatch", reason }, model: res.model, usage: res.usage };
  }

  const parsed = GradingResultSchema.safeParse(block.input);
  if (!parsed.success) {
    throw new Error(`grading output failed validation: ${parsed.error.message}`);
  }
  // 4本柱は常に決まった順・ラベルで返す
  const byKey = new Map(parsed.data.criteria.map((c) => [c.key, c]));
  const criteria = CRITERIA.map(({ key, label }) => {
    const c = byKey.get(key);
    if (!c) throw new Error(`missing criterion: ${key}`);
    return { ...c, label };
  });
  return {
    outcome: { kind: "graded", result: { ...parsed.data, criteria } },
    model: res.model,
    usage: res.usage,
  };
}
