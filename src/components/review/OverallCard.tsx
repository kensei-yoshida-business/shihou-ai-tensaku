import type { GradingResult } from "@/types/review";

const RANK_COLOR: Record<string, string> = {
  A: "bg-ok text-white",
  B: "bg-ok/80 text-white",
  C: "bg-brand text-white",
  D: "bg-brand/80 text-white",
  E: "bg-amber-600 text-white",
  F: "bg-redpen/80 text-white",
  G: "bg-redpen text-white",
};

/** 📊 総合評価 */
export function OverallCard({ result }: { result: GradingResult }) {
  const { overall, criteria } = result;
  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <h2 className="text-sm font-bold text-muted">📊 総合評価</h2>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center">
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-2xl font-serif text-5xl font-bold ${RANK_COLOR[overall.rank]}`}
          >
            {overall.rank}
          </div>
          <p className="mt-2 text-xs text-muted">推定ランク</p>
          <p className="text-sm font-medium">{overall.scoreOutOf100} / 100</p>
        </div>
        <div className="flex-1 space-y-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{overall.summary}</p>
          <ul className="space-y-2">
            {criteria.map((c) => (
              <li key={c.key} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-muted">{c.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-soft">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${c.score * 10}%` }} />
                </span>
                <span className="w-10 text-right font-medium">{c.score}/10</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
