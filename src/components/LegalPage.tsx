export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-line bg-white p-8 text-sm leading-relaxed">
      <h1 className="font-serif text-2xl font-bold">{title}</h1>
      {children}
    </article>
  );
}

/** 【要記入】の箇所は公開前に必ず実際の内容へ置き換える */
export function Todo({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-amber-100 px-1 text-amber-900">【要記入】{children}</span>;
}
