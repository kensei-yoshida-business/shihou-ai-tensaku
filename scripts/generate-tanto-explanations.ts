/**
 * 解説がまだない短答の肢について、Claude で解説を一括生成して DB に保存する。
 * Message Batches API を使うので通常の半額で処理できる（完了まで最大24時間）。
 *
 *   npm run tanto:explain            # バッチを投入して完了まで待ち、結果を保存
 *   npm run tanto:explain -- --limit 50
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, EXPLANATION_MODEL } from "../src/lib/anthropic";
import { prisma } from "../src/lib/db";

const SYSTEM = `
あなたは司法試験・予備試験の短答式試験の指導経験が豊富な講師です。
短答式過去問の1つの肢について、受験生向けの簡潔な解説を書きます。

- 肢の正誤は法務省の正解表から確定しており、<truth> に与えます。正誤を疑ったり覆したりせず、
  その正誤になる根拠（条文・判例の要旨・考え方）を説明してください。
- 根拠条文は確実なものだけを条番号で示し、判例は確信が持てる場合だけ「最判平成◯年」等で示します。
  年月日や掲載誌が不確かなら書きません。
- 3〜6文程度。誤りの肢では、どこをどう直せば正しい記述になるかも示します。
- 出題後の法改正により、現行法では結論が異なる可能性がある場合は lawChangeNote に書きます。なければ空文字です。
- 必ず submit_explanation ツールで返します。
`.trim();

const tool: Anthropic.Tool = {
  name: "submit_explanation",
  description: "肢の解説を提出する",
  input_schema: {
    type: "object",
    required: ["explanation", "lawChangeNote"],
    properties: {
      explanation: { type: "string" },
      lawChangeNote: { type: "string" },
    },
  },
};

function limitArg(): number | undefined {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await prisma.tantoStatement.findMany({
    where: { explanationStatus: "none" },
    take: limitArg(),
    include: { question: { include: { exam: true } } },
  });
  if (targets.length === 0) {
    console.log("解説が未生成の肢はありません");
    return;
  }

  const requests = targets.map((s, i) => {
    const q = s.question;
    const examName = q.exam.examType === "yobi" ? "司法試験予備試験" : "司法試験";
    return {
      // custom_id は英数字・_・- のみなので、肢 id（カナを含む）ではなく連番を使う
      custom_id: `s${i}`,
      params: {
        model: EXPLANATION_MODEL,
        max_tokens: 2000,
        system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
        tools: [tool],
        tool_choice: { type: "tool" as const, name: tool.name },
        messages: [
          {
            role: "user" as const,
            content: [
              `<exam>${q.exam.eraLabel}${examName} 短答式 ${q.subjectLabel} 第${q.number}問 肢${s.label}</exam>`,
              `<stem>${q.stem}</stem>`,
              `<statement>${s.text}</statement>`,
              `<truth>${s.isCorrect ? "正しい（○）" : "誤り（×）"}</truth>`,
            ].join("\n"),
          },
        ],
      },
    };
  });

  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`バッチ ${batch.id} を投入（${requests.length}件）`);

  let status = batch.processing_status;
  while (status !== "ended") {
    await sleep(30_000);
    status = (await anthropic.messages.batches.retrieve(batch.id)).processing_status;
    console.log(`  状態: ${status}`);
  }

  let saved = 0;
  let failed = 0;
  for await (const r of await anthropic.messages.batches.results(batch.id)) {
    const s = targets[Number(r.custom_id.slice(1))];
    if (r.result.type !== "succeeded") {
      failed++;
      continue;
    }
    const block = r.result.message.content.find((b) => b.type === "tool_use");
    const input = block?.type === "tool_use" ? (block.input as { explanation?: string; lawChangeNote?: string }) : null;
    if (!input?.explanation) {
      failed++;
      continue;
    }
    await prisma.tantoStatement.update({
      where: { id: s.id },
      data: {
        explanation: input.explanation,
        lawChangeNote: input.lawChangeNote?.trim() || null,
        explanationStatus: "ai_generated",
      },
    });
    saved++;
  }
  console.log(`保存 ${saved}件 / 失敗 ${failed}件（失敗分は再実行で再生成されます）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
