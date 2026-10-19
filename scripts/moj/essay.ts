/**
 * 論文式の問題・出題趣旨・採点実感の PDF テキストを、科目ごとの区間に切り分ける。
 *
 * 見出しの形（法務省の PDF で共通）
 *   【公法系科目】          出題趣旨の系の見出し
 *   ［公法系科目］ ［倒 産 法］ ［憲 法］   問題・出題趣旨の系／科目の見出し
 *   〔第１問〕（配点：…）     問題の見出し（出題趣旨では「〔第１問〕」だけ）
 *   令和７年司法試験の採点実感（民事系科目第１問）／（倒産法）   採点実感の見出し
 */
import { compact, toAscii } from "./normalize";
import { SECTIONS, SectionName, SubjectId, sectionFromHeading, subjectFromHeading } from "./subjects";

/** 区間のキー。司法試験の系科目は「系#問番号」、それ以外は科目 id */
export type SegmentKey = SubjectId | `${keyof typeof SECTIONS}#${number}`;

export function segmentEssayText(raw: string, opts: { section?: SectionName | null } = {}): Map<SegmentKey, string> {
  const lines = raw.replace(/\r/g, "").split(/\n|\f/);
  const out = new Map<SegmentKey, string[]>();
  let section: SectionName | null = opts.section ?? null;
  let subject: SubjectId | null = null;
  let qnum: number | null = null;

  const key = (): SegmentKey | null => {
    if (subject) return subject;
    if (section && section !== "選択科目" && qnum) return `${section}#${qnum}`;
    return null;
  };

  for (const line of lines) {
    const t = line.trim();
    const c = compact(t);

    // 採点実感の見出し:「…採点実感（等に関する意見）（民事系科目第１問）」「…（倒産法）」
    const imp = c.match(/^(?:平成|令和).*採点実感[^（]*（(.+?)）(?:（補足）)?$/);
    if (imp) {
      const m = imp[1].match(/^(公法系科目|民事系科目|刑事系科目)第(\d+)問$/);
      if (m) {
        section = m[1] as SectionName;
        qnum = Number(m[2]);
        subject = null;
        continue;
      }
      const s = subjectFromHeading(imp[1]);
      if (s) {
        subject = s;
        qnum = null;
        continue;
      }
    }
    // 【公法系科目】【選択科目】
    if (/^【[^】]+】$/.test(c)) {
      const s = sectionFromHeading(c);
      if (s) {
        section = s;
        subject = null;
        qnum = null;
        continue;
      }
    }
    // ［公法系科目］［倒産法］［憲法］。「［民事訴訟法］（〔設問１〕と〔設問２〕の配点の割合は…）」のように注記が続く行もある
    const bracket = /^[［\[].+[］\]）)]$/.test(c) && c.length <= 24 ? c : c.match(/^([［\[][^］\]]{1,20}[］\]])（.*配点/)?.[1];
    if (bracket) {
      const s = subjectFromHeading(bracket);
      if (s) {
        subject = s;
        qnum = null;
        continue;
      }
      const sec = sectionFromHeading(bracket);
      if (sec) {
        section = sec;
        subject = null;
        qnum = null;
        continue;
      }
    }
    // 〔第１問〕（配点：…）
    const q = toAscii(t).match(/^〔第(\d+)問〕/);
    if (q) {
      qnum = Number(q[1]);
      if (section !== "選択科目" && !isStandaloneSubject(subject)) subject = null;
    }

    const k = key();
    if (!k) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join("\n")]));
}

/** 選択科目のように、科目の中に第１問・第２問がある科目 */
function isStandaloneSubject(s: SubjectId | null): boolean {
  return !!s && !Object.values(SECTIONS).some((ids) => (ids as readonly string[]).includes(s));
}

/** 司法試験の系科目の第N問が、どの科目か */
export function sectionSubject(section: keyof typeof SECTIONS, n: number): SubjectId | null {
  return (SECTIONS[section][n - 1] as SubjectId | undefined) ?? null;
}
