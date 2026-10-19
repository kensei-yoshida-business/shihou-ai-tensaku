import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-brand px-6 py-12 text-white sm:px-10">
        <p className="text-sm opacity-80">司法試験・予備試験 論文式／短答式</p>
        <h1 className="mt-2 font-serif text-3xl font-bold leading-snug sm:text-4xl">
          過去問の答案を、出題趣旨と採点実感で
          <br className="hidden sm:block" />
          その場で添削。
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-90">
          法務省が公表した過去問を選んで答案を提出すると、その年度の出題趣旨・採点実感を基準に、
          論点の網羅性・法的論理思考・規範の正確性・表現力の4つの観点からAIが採点し、赤ペン添削を返します。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/submit" className="rounded-md bg-white px-5 py-2.5 font-medium text-brand">
            論文答案を添削する
          </Link>
          <Link href="/tanto" className="rounded-md border border-white/60 px-5 py-2.5 font-medium">
            短答を一問一答で解く
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["📊 推定ランクと総合評価", "A〜Gの推定ランクと、4つの観点ごとの点数・講評。"],
          ["✍️ 赤ペン添削", "答案の該当箇所を引用し、何が問題でどう書き直すかを具体的に示します。"],
          ["💡 思考プロセス", "問題文の読み方から答案構成まで、次に同種の問題を解くための手順。"],
        ].map(([title, body]) => (
          <div key={title} className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-bold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
