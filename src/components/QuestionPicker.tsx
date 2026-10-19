"use client";

import { EXAM_TYPE_LABEL } from "@/lib/labels";

export type QuestionOption = {
  id: string;
  examType: string;
  year: number;
  eraLabel: string;
  subjectLabel: string;
  sectionLabel: string;
};

const selectClass = "rounded-md border border-line bg-white px-3 py-2 text-sm disabled:opacity-50";

/** 試験 → 年度 → 科目 の3段セレクタ。選べるのは登録済みの過去問だけ */
export function QuestionPicker({
  questions,
  value,
  onChange,
}: {
  questions: QuestionOption[];
  value: QuestionOption | null;
  onChange: (q: QuestionOption | null) => void;
}) {
  const examTypes = [...new Set(questions.map((q) => q.examType))];
  const examType = value?.examType ?? "";
  const years = [...new Set(questions.filter((q) => q.examType === examType).map((q) => q.year))];
  const year = value?.year;
  const subjects = questions.filter((q) => q.examType === examType && q.year === year);

  const pickFirst = (list: QuestionOption[]) => onChange(list[0] ?? null);

  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        試験
        <select
          className={selectClass}
          value={examType}
          onChange={(e) => pickFirst(questions.filter((q) => q.examType === e.target.value))}
        >
          <option value="" disabled>
            選択してください
          </option>
          {examTypes.map((t) => (
            <option key={t} value={t}>
              {EXAM_TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        年度
        <select
          className={selectClass}
          disabled={!examType}
          value={year ?? ""}
          onChange={(e) =>
            pickFirst(questions.filter((q) => q.examType === examType && q.year === Number(e.target.value)))
          }
        >
          {years.map((y) => {
            const q = questions.find((x) => x.examType === examType && x.year === y)!;
            return (
              <option key={y} value={y}>
                {q.eraLabel}
              </option>
            );
          })}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        科目
        <select
          className={selectClass}
          disabled={!examType}
          value={value?.id ?? ""}
          onChange={(e) => onChange(subjects.find((q) => q.id === e.target.value) ?? null)}
        >
          {subjects.map((q) => (
            <option key={q.id} value={q.id}>
              {q.subjectLabel}（{q.sectionLabel}）
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
