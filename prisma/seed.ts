/**
 * data/past-exams（論文式）と data/tanto（短答式）の JSON を DB に投入する。
 * 何度実行しても同じ結果になる（upsert）。短答の解説は、肢の文言か正誤が変わったときだけ消す。
 *
 *   npm run db:seed
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { decompose, SourceTantoQuestion } from "../src/lib/tanto/decompose";

const prisma = new PrismaClient();
const ROOT = join(__dirname, "..", "data");

const ExamMeta = z.object({
  examType: z.enum(["shihou", "yobi", "sample"]),
  year: z.number().int(),
  eraLabel: z.string(),
  subject: z.string(),
  subjectLabel: z.string(),
});

const EssayFile = ExamMeta.extend({
  sectionLabel: z.string(),
  pageLimit: z.number().int().optional(),
  timeLimitMin: z.number().int().optional(),
  published: z.boolean().default(false),
  problemText: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  materials: z.array(
    z.object({
      kind: z.enum(["intent", "impression", "grading_policy"]),
      text: z.string().min(1),
      sourceUrl: z.string().url(),
      fetchedAt: z.coerce.date(),
    }),
  ),
});

const TantoFile = ExamMeta.extend({
  sourceUrl: z.string().url(),
  questions: z.array(SourceTantoQuestion),
});

function jsonFiles(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(jsonFiles(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function load<S extends z.ZodTypeAny>(schema: S, file: string): z.infer<S> {
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${relative(ROOT, file)}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function upsertExam(m: z.infer<typeof ExamMeta>) {
  const id = `${m.examType}-${m.year}`;
  await prisma.exam.upsert({
    where: { id },
    update: { eraLabel: m.eraLabel },
    create: { id, examType: m.examType, year: m.year, eraLabel: m.eraLabel },
  });
  return id;
}

async function seedEssay(file: string) {
  const d = load(EssayFile, file);
  const examId = await upsertExam(d);
  const id = `${examId}-${d.subject}`;
  const fields = {
    subjectLabel: d.subjectLabel,
    sectionLabel: d.sectionLabel,
    problemText: d.problemText,
    sourceUrl: d.sourceUrl,
    pageLimit: d.pageLimit,
    timeLimitMin: d.timeLimitMin,
    published: d.published,
  };
  await prisma.question.upsert({
    where: { id },
    update: fields,
    create: { id, examId, subject: d.subject, ...fields },
  });
  for (const m of d.materials) {
    await prisma.questionMaterial.upsert({
      where: { questionId_kind: { questionId: id, kind: m.kind } },
      update: { text: m.text, sourceUrl: m.sourceUrl, fetchedAt: m.fetchedAt },
      create: { questionId: id, ...m },
    });
  }
  return id;
}

async function seedTanto(file: string) {
  const d = load(TantoFile, file);
  const examId = await upsertExam(d);
  let statements = 0;
  const skipped: number[] = [];

  for (const q of d.questions) {
    const decomposed = decompose(q);
    if (!decomposed) {
      skipped.push(q.number);
      continue;
    }
    const questionId = `${examId}-${d.subject}-${q.number}`;
    const fields = {
      subjectLabel: d.subjectLabel,
      stem: q.stem,
      format: q.format,
      officialAnswer: q.officialAnswer,
      sourceUrl: d.sourceUrl,
      topicTags: q.topicTags,
      published: q.published,
    };
    await prisma.tantoQuestion.upsert({
      where: { id: questionId },
      update: fields,
      create: { id: questionId, examId, subject: d.subject, number: q.number, ...fields },
    });

    for (const s of decomposed) {
      const id = `${questionId}-${s.label}`;
      const existing = await prisma.tantoStatement.findUnique({ where: { id } });
      if (!existing) {
        await prisma.tantoStatement.create({ data: { id, questionId, ...s } });
      } else if (existing.text !== s.text || existing.isCorrect !== s.isCorrect) {
        // 文言・正誤が変わったら古い解説は使えない
        await prisma.tantoStatement.update({
          where: { id },
          data: { text: s.text, isCorrect: s.isCorrect, explanation: null, explanationStatus: "none", lawChangeNote: null },
        });
      }
      statements++;
    }
  }
  return { statements, skipped };
}

// 動作確認用のサンプル（data/**/sample/）は、SEED_SAMPLES=1 のときだけ投入する。本番DBには入れない
const includeSamples = process.env.SEED_SAMPLES === "1";
const isSample = (file: string) => relative(ROOT, file).split(/[\\/]/).includes("sample");
const targets = (dir: string) => jsonFiles(join(ROOT, dir)).filter((f) => includeSamples || !isSample(f));

async function main() {
  if (!includeSamples) console.log("サンプルデータは投入しません（投入するには SEED_SAMPLES=1）");
  for (const file of targets("past-exams")) {
    const id = await seedEssay(file);
    console.log(`論文 ${id}`);
  }
  for (const file of targets("tanto")) {
    const { statements, skipped } = await seedTanto(file);
    const note = skipped.length ? `（一問一答化しない問題: 第${skipped.join("・")}問）` : "";
    console.log(`短答 ${relative(ROOT, file)}: ${statements}肢${note}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
