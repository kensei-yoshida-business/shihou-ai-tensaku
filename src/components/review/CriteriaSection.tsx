import type { GradingResult } from "@/types/review";

/** 🔍 4本柱ごとの詳細評価 */
export function CriteriaSection({ result }: { result: GradingResult }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-muted">🔍 各項目の詳細評価</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {result.criteria.map((c, i) => (
          <article key={c.key} className="rounded-2xl border border-line bg-white p-5">
            <header className="flex items-baseline justify-between">
              <h3 className="font-bold">
                {i + 1}. {c.label}
              </h3>
              <span className="text-lg font-bold text-brand">{c.score}/10</span>
            </header>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{c.feedback}</p>
            {c.strengths.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-ok">良い点</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {c.strengths.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {c.issues.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-redpen">課題</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {c.issues.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
      {result.missedIssues.length > 0 && (
        <div className="rounded-2xl border border-redpen/30 bg-redpen/5 p-5">
          <p className="text-sm font-bold text-redpen">落としている論点</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.missedIssues.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
