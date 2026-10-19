import { z } from "zod";

export const CRITERIA = [
  { key: "coverage", label: "論点の網羅性" },
  { key: "reasoning", label: "法的論理思考" },
  { key: "doctrine", label: "規範の正確性・法的構成" },
  { key: "expression", label: "表現力・論述の構成力" },
] as const;

export const RANKS = ["A", "B", "C", "D", "E", "F", "G"] as const;

const CriterionResult = z.object({
  key: z.enum(["coverage", "reasoning", "doctrine", "expression"]),
  label: z.string(),
  score: z.number().int().min(1).max(10),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  feedback: z.string(),
});

const RedPen = z.object({
  quote: z.string(),
  problem: z.string(),
  suggestion: z.string(),
  severity: z.enum(["critical", "major", "minor"]),
});

/** 採点が成立したときの結果（画面の 📊🔍✍️💡 に対応） */
export const GradingResultSchema = z.object({
  overall: z.object({
    rank: z.enum(RANKS),
    summary: z.string(),
    scoreOutOf100: z.number().int().min(0).max(100),
  }),
  criteria: z.array(CriterionResult).length(4),
  redPens: z.array(RedPen),
  missedIssues: z.array(z.string()),
  thinkingProcess: z.object({
    steps: z.array(z.object({ title: z.string(), detail: z.string() })),
    idealOutline: z.string(),
  }),
  disclaimer: z.string(),
});

export type GradingResult = z.infer<typeof GradingResultSchema>;

/** Claude の出力。答案が選んだ過去問と無関係なら mismatch のみ */
export type GradingOutcome =
  | { kind: "graded"; result: GradingResult }
  | { kind: "mismatch"; reason: string };
