/** 法務省サイトのページから、本文中のリンクを直前の見出しつきで取り出す */
export type PageLink = { href: string; text: string; headings: string[] };

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

export function pageTitle(html: string): string {
  const m = html.match(/<h1[^>]*class="cnt_ttl01"[^>]*>([\s\S]*?)<\/h1>/);
  return m ? decode(m[1]) : "";
}

export function contentLinks(html: string, baseUrl: string): PageLink[] {
  // 本文（#content）だけを見る。予備試験の一覧ページには <a href="$a.url"> の入れ子が混じるので外す
  const body = (html.match(/<div id="content">([\s\S]*?)(?:<div id="pagetop">|ページトップへ)/)?.[1] ?? html).replace(
    /<a href="\$a\.url">/g,
    "",
  );
  const out: PageLink[] = [];
  const headings: string[] = []; // [h2, h3, h4]
  const re = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>|<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(body)); ) {
    if (m[1]) {
      const level = Number(m[1]) - 2;
      headings.length = level;
      headings[level] = decode(m[2]);
      continue;
    }
    const href = m[3];
    if (href.startsWith("#") || href.startsWith("javascript:")) continue;
    out.push({ href: new URL(href, baseUrl).toString(), text: decode(m[4]), headings: headings.filter(Boolean) });
  }
  return out;
}
