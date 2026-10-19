import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CACHE_DIR, getPdf } from "./http";

// 日本語の定義済み CMap（90ms-RKSJ-H など）で文字を描く PDF は、これがないと文字が取り出せない
const PDFJS_DIR = join(__dirname, "..", "..", "node_modules", "pdfjs-dist");

/**
 * フォントの文字対応表がない PDF で出る文字化け。字形番号がそのまま文字コードとして読まれ、
 * 制御文字・アルメニア文字〜モンゴル文字・CJK 統合漢字拡張A などの、法務省の資料では使わない範囲に化ける
 */
export const GARBLED = /[\u0000-\u0008\u000e-\u001f\u0080-\u009f\u0530-\u1dff\u27c0-\u2bff\u2c00-\u2dff\u3100-\u31ff\u3400-\u4dbf]/;
const GARBLED_G = new RegExp(GARBLED.source, "g");

/** PDF の各ページの文字片を座標つきで取り出す（表の列を判定するため）。y は上から下へ増える */
export type TextItem = { str: string; x: number; y: number; w: number; h: number };

export async function pdfItems(url: string): Promise<TextItem[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const original = await getPdf(url);
  // 文字の対応表を補った版（scripts/moj/repair-fonts.py）があればそちらを読む
  const repaired = join(CACHE_DIR, "repaired", basename(original));
  const data = new Uint8Array(readFileSync(existsSync(repaired) ? repaired : original));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    verbosity: 0,
    cMapUrl: join(PDFJS_DIR, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(PDFJS_DIR, "standard_fonts") + "/",
  }).promise;
  const pages: TextItem[][] = [];
  try {
    // 非表示のレイヤー（オプショナルコンテンツ）の文字は読まない。別の冊子の文章が隠れて入っている PDF がある
    const oc = await doc.getOptionalContentConfig();
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      // ページの回転（横向きの正解表など）を反映した表示上の座標にそろえる
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent({ includeMarkedContent: true });
      const items: TextItem[] = [];
      const hidden: boolean[] = [];
      for (const it of content.items) {
        if ("type" in it) {
          if (it.type === "beginMarkedContentProps" || it.type === "beginMarkedContent")
            hidden.push((hidden.at(-1) ?? false) || (it.type === "beginMarkedContentProps" && !!it.id && !oc.isVisible(it.id)));
          else if (it.type === "endMarkedContent") hidden.pop();
          continue;
        }
        if (hidden.at(-1) || !it.str.trim()) continue;
        // 大半が文字化けの文字片は捨てる（対応表を補えなかった、隠れて重ねられた別の文章など）。
        // 一部だけ化けた文字片は残し、取り込み側で文字化けとして扱う
        if ((it.str.match(GARBLED_G)?.length ?? 0) > it.str.length / 2) continue;
        const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, it.transform);
        items.push({ str: it.str, x, y, w: it.width, h: Math.hypot(it.transform[2], it.transform[3]) || it.height });
      }
      pages.push(items);
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/**
 * 座標から読み順どおりのテキストを組み立てる（上から下、左から右）。
 * pdf-parse の抽出は PDF 内の描画順に従うため、句読点だけ別に描画された PDF で文が崩れることがある。
 * ページの区切りは \f
 */
export function itemsToText(pages: TextItem[][]): string {
  return pages
    .map((items) => {
      const sorted = mergeDetachedPunctuation(items.filter((it) => !PAGE_NUMBER.test(it.str.trim()))).sort(
        (a, b) => a.y - b.y || a.x - b.x,
      );
      const lines: TextItem[][] = [];
      for (const it of sorted) {
        const line = lines[lines.length - 1];
        // 同じ行: ベースラインの差が文字の高さの半分未満
        if (line && Math.abs(line[0].y - it.y) < Math.max(2, Math.min(line[0].h, it.h) * 0.5)) line.push(it);
        else lines.push([it]);
      }
      return lines
        .map((line) => {
          line.sort((a, b) => a.x - b.x);
          let s = "";
          let end = -Infinity;
          for (const it of line) {
            // 文字1つ分以上の隙間は空白にする（表の列や「ア　イ」の区切り）
            if (s && it.x - end > it.h * 0.9) s += " ";
            s += it.str;
            end = Math.max(end, it.x + it.w);
          }
          return s;
        })
        .join("\n");
    })
    .join("\f");
}

const PAGE_NUMBER = /^[-－‐]\s*[０-９\d]+\s*[-－‐]$/;
const PUNCT = /^[。、，．）」』]+$/;

/**
 * 一部の PDF は「という ）」のように句読点の位置を空白にした文字列と、句読点だけの文字片を別に描画している。
 * 句読点の文字片が同じ行の長い文字片の範囲内にあれば、位置の最も近い空白に差し込む。
 */
function mergeDetachedPunctuation(items: TextItem[]): TextItem[] {
  const out = items.map((it) => ({ ...it }));
  const removed = new Set<TextItem>();
  for (const p of out) {
    if (!PUNCT.test(p.str)) continue;
    const host = out.find(
      (it) =>
        it !== p &&
        !removed.has(it) &&
        it.str.includes(" ") &&
        Math.abs(it.y - p.y) < Math.max(2, it.h * 0.5) &&
        p.x > it.x &&
        p.x < it.x + it.w,
    );
    if (!host) continue;
    // 文字ごとの位置を全角1・半角0.5の比で割り振って推定する
    const chars = [...host.str];
    const units = chars.map((c) => (/[\x20-\x7e]/.test(c) ? 0.5 : 1));
    const total = units.reduce((a, b) => a + b, 0);
    let acc = 0;
    let best = -1;
    let bestDist = Infinity;
    for (const [i, c] of chars.entries()) {
      const cx = host.x + (host.w * acc) / total;
      acc += units[i];
      if (c !== " ") continue;
      const d = Math.abs(cx - p.x);
      if (d < bestDist) [best, bestDist] = [i, d];
    }
    if (best < 0) continue;
    chars[best] = p.str;
    host.str = chars.join("");
    removed.add(p);
  }
  return out.filter((it) => !removed.has(it));
}
