"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXAM_TYPE_LABEL } from "@/lib/labels";

export type TantoOptions = {
  exams: { examType: string; year: number; eraLabel: string }[];
  subjects: { value: string; label: string }[];
};

const MODES = [
  ["all", "すべて（未回答 → 間違えた肢 → 正解済みの順）"],
  ["unanswered", "未回答の肢だけ"],
  ["wrong", "前回間違えた肢だけ"],
] as const;

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function TantoFilterForm({ options }: { options: TantoOptions }) {
  const router = useRouter();
  const examTypes = [...new Set(options.exams.map((e) => e.examType))];
  const [examType, setExamType] = useState(examTypes[0] ?? "");
  const [years, setYears] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [mode, setMode] = useState<(typeof MODES)[number][0]>("all");

  if (options.exams.length === 0) {
    return <p className="rounded-xl border border-line bg-white p-6 text-sm">公開中の短答式過去問がまだありません。</p>;
  }

  function start() {
    const p = new URLSearchParams({ examType, mode });
    if (years.length) p.set("years", years.join(","));
    if (subjects.length) p.set("subjects", subjects.join(","));
    router.push(`/tanto/play?${p}`);
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-brand bg-brand text-white" : "border-line bg-white"}`;

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-white p-6">
      <div>
        <p className="text-xs font-bold text-muted">試験</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {examTypes.map((t) => (
            <button
              key={t}
              className={chip(examType === t)}
              onClick={() => {
                setExamType(t);
                setYears([]);
              }}
            >
              {EXAM_TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-muted">年度（未選択ならすべて）</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.exams
            .filter((e) => e.examType === examType)
            .map((e) => (
              <button key={e.year} className={chip(years.includes(e.year))} onClick={() => setYears(toggle(years, e.year))}>
                {e.eraLabel}
              </button>
            ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-muted">科目（未選択ならすべて）</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.subjects.map((s) => (
            <button
              key={s.value}
              className={chip(subjects.includes(s.value))}
              onClick={() => setSubjects(toggle(subjects, s.value))}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-muted">出題</p>
        <div className="mt-2 space-y-1">
          {MODES.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <button onClick={start} className="w-full rounded-md bg-brand px-4 py-3 font-medium text-white sm:w-auto sm:px-8">
        はじめる
      </button>
    </div>
  );
}
