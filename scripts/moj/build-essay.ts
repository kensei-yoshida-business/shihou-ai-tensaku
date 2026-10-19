/**
 * manifest.json の論文式 PDF（問題・出題趣旨・採点実感）から
 * data/past-exams/<shihou|yobi>/<西暦>/<科目>.json を作る。
 */
import type { ManifestEntry } from "./classify";
import { eraLabel } from "./classify";
import { segmentEssayText, SegmentKey, sectionSubject } from "./essay";
import { cleanPdfText, compact } from "./normalize";
import { SECTIONS, SubjectId, SUBJECTS, sectionFromHeading } from "./subjects";

export type EssayJson = {
  examType: "shihou" | "yobi";
  year: number;
  eraLabel: string;
  subject: SubjectId;
  subjectLabel: string;
  sectionLabel: string;
  /** 人が原本と照合してから true にする（scripts/moj/publish.ts） */
  published: boolean;
  /** 取り込み時の自動チェックをすべて通ったか */
  _autoChecked: boolean;
  sourceUrl: string;
  problemText: string;
  materials: { kind: "intent" | "impression"; text: string; sourceUrl: string; fetchedAt: string }[];
  /** 取り込み時の自動チェックで気になった点（人が原本と見比べるときの目安） */
  _warnings?: string[];
};

/** 一般教養科目は問題文の素材（著作物）が「省略」とされていて答案を書けないため取り込まない */
const SKIP: SubjectId[] = ["ippan"];

/** 系科目の第N問が本当にその科目か、条文の引用数で確かめる（年度により問の割り当てが違わないか） */
const CITATIONS: Partial<Record<SubjectId, RegExp>> = {
  kenpo: /憲法第/g,
  gyosei: /行政事件訴訟法第|行政手続法第/g,
  minpo: /(?<![事商])民法第/g,
  shoho: /会社法第/g,
  minso: /民事訴訟法第/g,
  keiho: /(?<!訴訟)刑法第/g,
  keiso: /刑事訴訟法第/g,
};

/** 想定した科目より明らかに多く引用されている科目があれば返す */
function conflictingSubject(text: string, expected: SubjectId): SubjectId | null {
  const count = (id: SubjectId) => text.match(CITATIONS[id]!)?.length ?? 0;
  const mine = count(expected);
  for (const id of Object.keys(CITATIONS) as SubjectId[]) {
    if (id !== expected && count(id) >= 5 && count(id) > mine * 2) return id;
  }
  return null;
}

/** 区間のキーを科目 id に */
function subjectOf(key: SegmentKey): SubjectId | null {
  const m = key.match(/^(.+)#(\d+)$/);
  if (!m) return key as SubjectId;
  return sectionSubject(m[1] as keyof typeof SECTIONS, Number(m[2]));
}

function sectionLabelOf(examType: "shihou" | "yobi", key: SegmentKey, problemLinkText: string): string {
  const m = key.match(/^(.+)#(\d+)$/);
  if (m) return `${m[1]}第${m[2]}問`;
  if ((SUBJECTS as Record<string, string>)[key] && examType === "shihou") return "選択科目";
  return problemLinkText.replace(/\s+/g, "");
}

/** 問題文に混じる表紙・柱の行（「論文式試験問題集」「［憲法・行政法］」など）を除く */
function stripRunningHeads(text: string): string {
  return text
    .split("\n")
    .filter((l) => {
      const c = compact(l);
      if (/^論文式試験問題集/.test(c)) return false;
      if (/^[［\[][^］\]]+[］\]]$/.test(c) && /・|系科目|選択科目/.test(c)) return false;
      return true;
    })
    .join("\n");
}

/** 予備試験の出題趣旨は問題文を再掲した後に「（出題の趣旨）」が続くので、その後ろだけを使う */
function materialBody(text: string): string {
  const parts = text.split(/^\s*[（(]出題の?趣旨[）)]\s*$/m);
  return parts.length > 1 ? parts.slice(1).join("\n") : text;
}

type Collected = { text: string[]; urls: string[]; fetchedAt: string };

export function buildEssays(manifest: ManifestEntry[], texts: Map<string, string>): EssayJson[] {
  const groups = new Map<string, ManifestEntry[]>();
  for (const e of manifest) {
    if (!e.kind.startsWith("essay_")) continue;
    const k = `${e.examType}-${e.year}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  const out: EssayJson[] = [];
  for (const entries of groups.values()) {
    const { examType, year } = entries[0];
    const parts = {
      problem: new Map<SegmentKey, Collected>(),
      intent: new Map<SegmentKey, Collected>(),
      impression: new Map<SegmentKey, Collected>(),
    };
    const problemLink = new Map<SegmentKey, string>();
    for (const e of entries) {
      const raw = texts.get(e.url);
      if (!raw) continue;
      const kind = e.kind.replace("essay_", "") as keyof typeof parts;
      for (const [key, seg] of segmentEssayText(raw, { section: sectionFromHeading(e.text) })) {
        if (!seg.replace(/\s/g, "")) continue;
        const c = parts[kind].get(key) ?? { text: [], urls: [], fetchedAt: e.fetchedAt ?? "" };
        c.text.push(seg);
        if (!c.urls.includes(e.url)) c.urls.push(e.url);
        parts[kind].set(key, c);
        if (kind === "problem") problemLink.set(key, e.text);
      }
    }

    for (const [key, problem] of parts.problem) {
      const subject = subjectOf(key);
      if (!subject || SKIP.includes(subject)) continue;
      const warnings: string[] = [];
      const problemText = cleanPdfText(stripRunningHeads(problem.text.join("\n")));
      const materials: EssayJson["materials"] = [];
      for (const kind of ["intent", "impression"] as const) {
        const m = parts[kind].get(key);
        if (!m) {
          if (kind === "intent") warnings.push("出題趣旨が見つからない（未公表か、PDF にテキストがない）");
          continue;
        }
        materials.push({ kind, text: cleanPdfText(materialBody(m.text.join("\n\n"))), sourceUrl: m.urls[0], fetchedAt: m.fetchedAt });
      }
      if (problemText.length < 400) warnings.push(`問題文が短い（${problemText.length}字）`);
      if (key.includes("#")) {
        const other = conflictingSubject(problemText + (parts.intent.get(key)?.text.join("") ?? ""), subject);
        if (other) warnings.push(`内容から見ると ${SUBJECTS[other]} の可能性`);
      }
      out.push({
        examType,
        year,
        eraLabel: eraLabel(year),
        subject,
        subjectLabel: SUBJECTS[subject],
        sectionLabel: sectionLabelOf(examType, key, problemLink.get(key) ?? ""),
        published: false,
        // 自動チェックに引っかからず、出題趣旨もそろっているもの
        _autoChecked: warnings.length === 0,
        sourceUrl: problem.urls[0],
        problemText,
        materials,
        ...(warnings.length ? { _warnings: warnings } : {}),
      });
    }
  }
  return out.sort((a, b) => a.examType.localeCompare(b.examType) || a.year - b.year || a.subject.localeCompare(b.subject));
}
