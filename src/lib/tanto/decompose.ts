import { z } from "zod";

/**
 * 短答式の原問題（data/tanto/**.json の1問）を、肢ごとの ○× に分解する。
 * 肢の正誤は法務省の正解表から機械的に導出し、AI には判断させない。
 */

const Statement = z.object({ label: z.string().min(1), text: z.string().min(1) });

const Base = z.object({
  number: z.number().int().positive(),
  published: z.boolean().default(false),
  stem: z.string().min(1),
  officialAnswer: z.string().min(1),
  topicTags: z.array(z.string()).default([]),
  statements: z.array(Statement).min(1),
});

export const SourceTantoQuestion = z.discriminatedUnion("format", [
  // 各肢の正誤を個別に答える形式。answers に正解表の正誤をそのまま書く
  Base.extend({ format: z.literal("each_tf"), answers: z.record(z.string(), z.boolean()) }),
  // 「正しいもの（誤っているもの）の組合せ」。choices は選択肢番号 → 肢ラベル
  Base.extend({
    format: z.literal("combination"),
    polarity: z.enum(["correct", "incorrect"]),
    choices: z.record(z.string(), z.array(z.string()).min(1)),
  }),
  // 「正しいもの（誤っているもの）を1つ選べ」。officialAnswer は正解の肢ラベル
  Base.extend({ format: z.literal("single_choice"), polarity: z.enum(["correct", "incorrect"]) }),
  // 穴埋め・個数問題など。肢単位の正誤が確定しないので一問一答にしない
  Base.extend({ format: z.literal("other") }),
]);

export type SourceTantoQuestion = z.infer<typeof SourceTantoQuestion>;

export type DecomposedStatement = { label: string; text: string; isCorrect: boolean };

export class DecomposeError extends Error {}

/** 一問一答にできない形式なら null */
export function decompose(q: SourceTantoQuestion): DecomposedStatement[] | null {
  const labels = q.statements.map((s) => s.label);
  const withTruth = (truth: (label: string) => boolean) =>
    q.statements.map((s) => ({ label: s.label, text: s.text, isCorrect: truth(s.label) }));

  switch (q.format) {
    case "each_tf": {
      for (const l of labels) {
        if (!(l in q.answers)) throw new DecomposeError(`第${q.number}問: 肢${l}の正誤が answers にない`);
      }
      return withTruth((l) => q.answers[l]);
    }
    case "combination": {
      const chosen = q.choices[q.officialAnswer];
      if (!chosen) throw new DecomposeError(`第${q.number}問: 正解 ${q.officialAnswer} が choices にない`);
      for (const l of chosen) {
        if (!labels.includes(l)) throw new DecomposeError(`第${q.number}問: 組合せの肢${l}が存在しない`);
      }
      // 正解の組合せに入る肢が polarity 側、それ以外が反対側
      const inAnswer = new Set(chosen);
      return withTruth((l) => inAnswer.has(l) === (q.polarity === "correct"));
    }
    case "single_choice": {
      if (!labels.includes(q.officialAnswer)) {
        throw new DecomposeError(`第${q.number}問: 正解の肢 ${q.officialAnswer} が存在しない`);
      }
      return withTruth((l) => (l === q.officialAnswer) === (q.polarity === "correct"));
    }
    case "other":
      return null;
  }
}
