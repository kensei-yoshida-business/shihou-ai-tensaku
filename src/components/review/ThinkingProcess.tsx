import type { GradingResult } from "@/types/review";

/** 💡 模範答案に近づけるための思考プロセス */
export function ThinkingProcess({ result }: { result: GradingResult }) {
  const { steps, idealOutline } = result.thinkingProcess;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-muted">💡 模範答案に近づけるための思考プロセス</h2>
      <div className="grid gap-4 md:grid-cols-5">
        <ol className="space-y-3 md:col-span-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-2xl border border-brand/30 bg-brand-soft p-5 md:col-span-2">
          <p className="text-sm font-bold text-brand">あるべき答案構成（骨子）</p>
          <p className="prose-answer mt-2 text-sm">{idealOutline}</p>
        </div>
      </div>
    </section>
  );
}
