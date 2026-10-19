import Anthropic from "@anthropic-ai/sdk";

// ANTHROPIC_API_KEY を自動で参照する
// Vercel の関数の最大実行時間（300 秒）より前に打ち切り、チケット返却まで終えられるようにする
export const anthropic = new Anthropic({ timeout: 270_000, maxRetries: 1 });

export const GRADING_MODEL = process.env.GRADING_MODEL ?? "claude-opus-5-5";
export const EXPLANATION_MODEL = process.env.EXPLANATION_MODEL ?? "claude-opus-5-5";
