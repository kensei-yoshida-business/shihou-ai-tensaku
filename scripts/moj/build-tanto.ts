/**
 * manifest.json の短答式の問題 PDF と正解表から data/tanto/<shihou|yobi>/<西暦>/<科目>.json を作る。
 * 肢の正誤は正解表から機械的に導出できる問題だけを一問一答にし、それ以外は収録しない。
 */
import type { ManifestEntry } from "./classify";
import { eraLabel } from "./classify";
import type { AnswerTable } from "./answers";
import { compact, toAscii } from "./normalize";
import { SECTIONS, SubjectId, SUBJECTS, sectionFromHeading, subjectFromHeading } from "./subjects";
import { parseQuestion, ParsedTantoQuestion, splitQuestions } from "./tanto";

type TantoQuestionJson = {
  number: number;
  published: boolean;
  format: "each_tf" | "combination" | "single_choice";
  stem: string;
  officialAnswer: string;
  topicTags: string[];
  statements: { label: string; text: string }[];
  answers?: Record<string, boolean>;
  polarity?: "correct" | "incorrect";
  choices?: Record<string, string[]>;
};

export type TantoJson = {
  examType: "shihou" | "yobi";
  year: number;
  eraLabel: string;
  subject: SubjectId;
  subjectLabel: string;
  sourceUrl: string;
  answerSourceUrl: string;
  questions: TantoQuestionJson[];
  /** 一問一答にしなかった問題と理由 */
  _skipped: { number: number; reason: string }[];
};

/** 正解表どおりに採点されなかった問題（法務省の公表による） */
const EXCLUDED: { examType: string; year: number; subject: SubjectId; number: number; reason: string }[] = [
  { examType: "shihou", year: 2023, subject: "keiho", number: 6, reason: "受験者全員を正答とする取扱い（令和5年8月3日 司法試験委員会）" },
];

/**
 * 司法試験 H23〜H26 の「系」の問題冊子は科目の見出しがなく、問題番号が通し番号になっている。
 * 各科目の問題数（後ろの科目から数える）。公法系は憲法20問・行政法20問、刑事系は刑法20問・刑事訴訟法20問、
 * 民事系は末尾から民事訴訟法19問・商法19問で、残りが民法（年により36問か37問）。原本の問題文で確認済み。
 */
const SECTION_TAIL: Record<keyof typeof SECTIONS, number[]> = {
  公法系科目: [20],
  民事系科目: [19, 19],
  刑事系科目: [20],
};

export function sectionSubjectOf(section: keyof typeof SECTIONS, number: number, total: number): SubjectId {
  const subjects = SECTIONS[section];
  let end = total;
  const tail = SECTION_TAIL[section];
  for (let i = tail.length - 1; i >= 0; i--) {
    if (number > end - tail[i]) return subjects[i + 1];
    end -= tail[i];
  }
  return subjects[0];
}

/** 柱書の「〜に関する次の…」から論点の見出しを取る */
function topicTags(stem: string): string[] {
  const m = stem.replace(/\s/g, "").match(/^(?:（配点：?[^）]*）)?(.{2,30}?)に(?:関する|ついての)(?:次の|以下の|後記)/);
  return m ? [m[1]] : [];
}

/** 正解表の値から、収録する1問を組み立てる。正解表と問題の形が合わなければ理由を返す */
function toJson(p: ParsedTantoQuestion, table: AnswerTable): TantoQuestionJson | string {
  if (p.format === "other") return p.note ?? "一問一答にできない形式";
  const values = p.nos.map((no) => table.answers.get(no));
  if (!p.nos.length || values.some((v) => !v)) return `正解表に解答欄 No.${p.nos.join("・")} の正解がない`;
  const vals = values as string[];
  const labels = p.statements.map((s) => s.label);
  const base = { number: p.number, published: false, stem: p.stem, topicTags: topicTags(p.stem), statements: p.statements };

  switch (p.format) {
    case "each_tf": {
      if (!vals.every((v) => v === "1" || v === "2")) return `各肢の正誤の正解が1か2でない（${vals.join("・")}）`;
      const answers = Object.fromEntries(labels.map((l, i) => [l, vals[i] === "1"]));
      return { ...base, format: "each_tf", officialAnswer: vals.join("・"), answers };
    }
    case "tf_combination": {
      const tf = p.tfChoices![vals[0]];
      if (!tf) return `正解 ${vals[0]} が選択肢にない`;
      return { ...base, format: "each_tf", officialAnswer: vals[0], answers: tf };
    }
    case "combination": {
      if (!p.choices![vals[0]]) return `正解 ${vals[0]} が選択肢にない`;
      return { ...base, format: "combination", officialAnswer: vals[0], polarity: p.polarity!, choices: p.choices! };
    }
    case "single_choice": {
      if (!labels.includes(vals[0])) return `正解 ${vals[0]} が記述の番号にない`;
      return { ...base, format: "single_choice", officialAnswer: vals[0], polarity: p.polarity! };
    }
    case "multi_choice": {
      // 「２個選び（順不同）」は、正解の2つを1つの組合せとして扱う
      const chosen = [...new Set(vals)].sort();
      if (chosen.length !== 2 || !chosen.every((v) => labels.includes(v))) return `正解（${vals.join("・")}）が記述の番号と合わない`;
      const key = chosen.join("・");
      return { ...base, format: "combination", officialAnswer: key, polarity: p.polarity!, choices: { [key]: chosen } };
    }
  }
}

export function buildTanto(
  manifest: ManifestEntry[],
  texts: Map<string, string>,
  tables: Map<string, AnswerTable>,
): TantoJson[] {
  const out = new Map<string, TantoJson>();
  const problems = manifest.filter((e) => e.kind === "tanto_problem" && !/一般教養/.test(e.text));
  for (const e of problems) {
    const answer = manifest.find(
      (a) => a.kind === "tanto_answer" && a.examType === e.examType && a.year === e.year && compact(a.text) === compact(e.text),
    );
    const table = answer && tables.get(answer.url);
    const raw = texts.get(e.url);
    if (!answer || !table || !raw) continue;

    const qs = splitQuestions(raw);
    const parsed = qs.map(parseQuestion);
    // 科目: 単科目の冊子はリンク名、予備試験は冊子内の［憲法］などの見出し、司法試験の系の冊子は内容から
    const linkSubject = subjectFromHeading(e.text);
    const section = sectionFromHeading(e.text);
    const total = Math.max(0, ...qs.map((q) => q.number));

    qs.forEach((q, i) => {
      const subject = linkSubject ?? (q.heading ? subjectFromHeading(q.heading) : null) ?? (section && section !== "選択科目" ? sectionSubjectOf(section, q.number, total) : null);
      if (!subject) return;
      const key = `${e.examType}-${e.year}-${subject}`;
      const file =
        out.get(key) ??
        ({
          examType: e.examType as "shihou" | "yobi",
          year: e.year,
          eraLabel: eraLabel(e.year),
          subject,
          subjectLabel: SUBJECTS[subject],
          sourceUrl: e.url,
          answerSourceUrl: answer.url,
          questions: [],
          _skipped: [],
        } satisfies TantoJson);
      out.set(key, file);

      const p = parsed[i];
      // 問題番号は原本の第N問のまま（系の冊子では科目をまたいだ通し番号）
      const excluded = EXCLUDED.find((x) => x.examType === e.examType && x.year === e.year && x.subject === subject && x.number === p.number);
      const noted = table.notes.some((n) => toAscii(n).includes(`第${p.number}問`) && /全員/.test(n));
      const r = excluded ? excluded.reason : noted ? "正解表に「受験者全員を正答」の注記" : toJson(p, table);
      if (typeof r === "string") file._skipped.push({ number: p.number, reason: r });
      else file.questions.push(r);
    });
  }
  return [...out.values()].sort((a, b) => a.examType.localeCompare(b.examType) || a.year - b.year || a.subject.localeCompare(b.subject));
}
