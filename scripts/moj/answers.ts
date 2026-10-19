/**
 * 短答式の「正解及び配点」表（PDF）から、解答欄番号（No）ごとの正解を読み取る。
 *
 * 表は「問 | No | 解答 | 配点 | 備考」の列が左右に数組並ぶ。「問」のセルは複数の No にまたがって
 * 縦に結合されているため、行の区切りは No の列で取る。
 */
import type { TextItem } from "./items";

export type AnswerTable = {
  /** No → 正解（「3」など。数字以外の記載はそのまま） */
  answers: Map<number, string>;
  /** 表の下などにある注記（「第６問の採点に当たっては、受験者全員を正答とし…」など） */
  notes: string[];
};

const NO_HEADER = /^(No|Ｎｏ|№|ＮＯ|NO)[.．]?$/;
const NUM = /^[0-9０-９]+$/;
const toInt = (s: string) => Number(s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));

export function parseAnswerTable(pages: TextItem[][]): AnswerTable {
  const answers = new Map<number, string>();
  const notes: string[] = [];
  for (const items of pages) {
    const headers = items.filter((i) => NO_HEADER.test(i.str.trim())).sort((a, b) => a.x - b.x);
    if (!headers.length) continue;
    const headerY = Math.max(...headers.map((h) => h.y));
    // 各組の左端は「問」の見出し。No の見出しより左にある直近の「問」
    const qHeaders = items.filter((i) => i.str.trim() === "問").sort((a, b) => a.x - b.x);
    const blocks = headers.map((h) => {
      const q = [...qHeaders].reverse().find((qh) => qh.x < h.x);
      return { left: q ? q.x - 4 : h.x - 30, noX: h.x };
    });
    const blockOf = (x: number) => {
      for (let b = blocks.length - 1; b >= 0; b--) if (x >= blocks[b].left) return b;
      return -1;
    };

    // 組ごとに、y が近いもの（同じ行）の数値を左から並べる
    const cellsByBlock = blocks.map(() => [] as TextItem[]);
    for (const it of items) {
      const s = it.str.trim();
      if (it.y <= headerY + 2) continue;
      if (!NUM.test(s)) {
        if (/全員|正答とし|正解とし|いずれも/.test(s)) notes.push(s);
        continue;
      }
      const b = blockOf(it.x);
      if (b < 0 || it.x < blocks[b].noX - 4) continue; // 「問」の列は使わない
      cellsByBlock[b].push(it);
    }
    const rows: TextItem[][] = [];
    for (const cells of cellsByBlock) {
      cells.sort((a, b) => a.y - b.y);
      for (const c of cells) {
        const row = rows[rows.length - 1];
        if (row && cells.includes(row[0]) && Math.abs(row[0].y - c.y) < 3) row.push(c);
        else rows.push([c]);
      }
    }
    for (const cells of rows) {
      cells.sort((a, b) => a.x - b.x);
      const [no, ans] = cells;
      if (!no || !ans) continue;
      answers.set(toInt(no.str.trim()), String(toInt(ans.str.trim())));
    }
  }
  // 表の外の注記も拾う（文字片が細切れなので連結する）
  const all = pages.flat().map((i) => i.str).join("");
  const m = all.match(/※?第[０-９\d]+問の採点に当たって[^。]*。/g);
  if (m) notes.push(...m);
  return { answers, notes: [...new Set(notes)] };
}
