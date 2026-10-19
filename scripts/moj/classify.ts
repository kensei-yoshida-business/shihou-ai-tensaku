/**
 * 法務省サイトのリンク（ページ名・見出し・リンク文字列）から、PDF が何の資料かを判定する。
 */
export type RawPdfLink = {
  examType: "shihou" | "yobi";
  year: number;
  pageUrl: string;
  pageTitle: string;
  headings: string[];
  text: string;
  url: string;
};

export type ManifestKind =
  | "essay_problem" // 論文式の問題
  | "essay_intent" // 論文式の出題趣旨
  | "essay_impression" // 論文式の採点実感
  | "tanto_problem" // 短答式の問題
  | "tanto_answer" // 短答式の正解及び配点
  | "notice"; // 出題の誤り・取扱いなど個別のお知らせ

export type ManifestEntry = RawPdfLink & {
  kind: ManifestKind;
  /** 最初に一覧へ載せた日（出典表記の「利用日」に使う）。再取得しても変えない */
  fetchedAt?: string;
};

const ERA = { 平成: 1988, 令和: 2018 } as const;
const toAscii = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 「令和７年」「平成30年」「令和元年」→ 西暦 */
export function parseEraYear(s: string): number | null {
  const m = toAscii(s).match(/(平成|令和)(元|\d{1,2})年/);
  if (!m) return null;
  return ERA[m[1] as keyof typeof ERA] + (m[2] === "元" ? 1 : Number(m[2]));
}

export function eraLabel(year: number): string {
  if (year >= 2019) return year === 2019 ? "令和元年" : `令和${year - 2018}年`;
  return `平成${year - 1988}年`;
}

export function classify(r: RawPdfLink): ManifestEntry | null {
  const ctx = [r.pageTitle, ...r.headings].join(" / ");
  const all = `${ctx} / ${r.text}`;
  const out = (kind: ManifestKind): ManifestEntry => ({ ...r, kind });

  if (/委員会決定/.test(ctx)) return null; // 出題方針などの決定文書は過去問ではない
  if (/出題の趣旨|出題趣旨/.test(r.text)) return out("essay_intent");
  if (/採点実感/.test(all) && !/試験問題/.test(r.pageTitle)) return out("essay_impression");
  // 個別の問題についてのお知らせ（誤記・出題の誤り・採点上の取扱い）
  if (/^(平成|令和).+年/.test(r.text) && /第\d+問.*について|誤記|誤り/.test(toAscii(r.text))) return out("notice");
  if (/試験問題|試験問題集|問題$/.test(r.pageTitle)) {
    if (/短答/.test(ctx)) return out("tanto_problem");
    if (/論文/.test(ctx)) return out("essay_problem");
    // 見出しのない年度: 系科目・選択科目・法律実務基礎は論文、単独の科目名は短答
    if (/系科目|選択科目|法律実務基礎/.test(r.text)) return out("essay_problem");
    if (/^(憲法|民法|刑法)$/.test(r.text)) return out("tanto_problem");
    return null;
  }
  if (/短答/.test(r.pageTitle) && /正解|正答/.test(ctx)) return out("tanto_answer");
  return null;
}
