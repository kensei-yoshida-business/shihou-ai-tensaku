/**
 * PDF から抽出したテキストの整形。
 * ページ番号・ページ区切りを除き、PDF の行幅で折り返された行をつなぎ直す。
 */

/** 全角数字を半角に */
export const toAscii = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 見出しの比較用。空白をすべて除き、全角数字を半角にする */
export const compact = (s: string) => toAscii(s).replace(/[\s　]+/g, "");

/** 行頭がこれに当たる行は、前の行とつながない（見出し・箇条・条文・設問など） */
const BLOCK_START =
  /^(〔|【|［|\[|《|≪|〈|＜|・|※|第[０-９\d一二三四五六七八九十百]+[条章節]|[０-９\d]+[．.]|[（(][０-９\d一二三四五六七八九十]+[）)][ 　]|[⑴-⒇①-⑳㋐-㋾⒜-⒵][ 　]|[ア-ン][．.]|[ア-ン] |[Ａ-Ｚ甲乙丙丁][：:])/;

export function cleanPdfText(raw: string): string {
  const lines = raw
    .replace(/\r/g, "")
    .split(/\n|\f/)
    .map((l) => l.replace(/\t+/g, " ").replace(/ {2,}/g, " ").trimEnd())
    // ページ番号（「- 3 -」「－３－」）と pdf-parse の区切り
    .filter((l) => !/^\s*[-－‐]\s*[０-９\d]+\s*[-－‐]\s*$/.test(l) && !/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/.test(l));
  return joinWrappedLines(lines).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 1行の文字数が文書内の典型的な行幅に達している行は、PDF 上の折り返しとみなして次の行とつなぐ。
 * 行幅は文書ごとに違うので、行の長さの分布から推定する。
 */
export function joinWrappedLines(lines: string[]): string {
  const width = typicalWidth(lines);
  if (!width) return lines.join("\n");
  const out: string[] = [];
  let prevPhysical = ""; // つなぐ前の直前の行（判定はつないだ後の長さではなく元の行で行う）
  for (const line of lines) {
    const t = line.trim();
    if (
      out.length &&
      t &&
      visualLength(prevPhysical) >= width - 1.5 &&
      !/[。：]$/.test(prevPhysical) &&
      !BLOCK_START.test(t)
    ) {
      out[out.length - 1] += t;
    } else {
      out.push(t);
    }
    prevPhysical = t;
  }
  return out.join("\n");
}

/** 全角を1、半角を0.5として数えた行の長さ */
export function visualLength(s: string): number {
  let n = 0;
  for (const ch of s) n += /[\x20-\x7e]/.test(ch) ? 0.5 : 1;
  return n;
}

function typicalWidth(lines: string[]): number | null {
  const counts = new Map<number, number>();
  for (const l of lines) {
    const n = Math.round(visualLength(l.trim()));
    if (n >= 25) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best: [number, number] | null = null;
  for (const [n, c] of counts) if (!best || c > best[1] || (c === best[1] && n > best[0])) best = [n, c];
  // 折り返し行が十分にある文書だけ（表ばかりの文書などは触らない）
  return best && best[1] >= 5 ? best[0] : null;
}
