import type { GradingResult } from "@/types/review";

const SEVERITY = {
  critical: { label: "重大", className: "bg-redpen text-white" },
  major: { label: "重要", className: "bg-redpen/15 text-redpen" },
  minor: { label: "軽微", className: "bg-line text-muted" },
} as const;

/** ✍️ 赤ペン添削。答案の引用（左）と赤字の指摘・修正例（右） */
export function RedPenList({ result }: { result: GradingResult }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-muted">✍️ 赤ペン添削</h2>
      <ol className="space-y-3">
        {result.redPens.map((r, i) => (
          <li key={i} className="grid gap-0 overflow-hidden rounded-2xl border border-line bg-white md:grid-cols-2">
            <div className="border-b border-line p-4 md:border-r md:border-b-0">
              <p className="text-xs text-muted">答案 #{i + 1}</p>
              <p className="prose-answer mt-1 text-sm underline decoration-redpen decoration-wavy underline-offset-4">
                {r.quote}
              </p>
            </div>
            <div className="space-y-2 p-4">
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${SEVERITY[r.severity].className}`}>
                {SEVERITY[r.severity].label}
              </span>
              <p className="font-serif text-sm text-redpen">{r.problem}</p>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs font-bold text-muted">修正例</p>
                <p className="prose-answer mt-1 text-sm">{r.suggestion}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
