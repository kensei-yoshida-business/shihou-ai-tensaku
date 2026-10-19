import { compact } from "./normalize";

/** 科目の id と表示名。論文・短答で共通 */
export const SUBJECTS = {
  kenpo: "憲法",
  gyosei: "行政法",
  minpo: "民法",
  shoho: "商法",
  minso: "民事訴訟法",
  keiho: "刑法",
  keiso: "刑事訴訟法",
  "jitsumu-minji": "法律実務基礎科目（民事）",
  "jitsumu-keiji": "法律実務基礎科目（刑事）",
  ippan: "一般教養科目",
  tosan: "倒産法",
  sozei: "租税法",
  keizai: "経済法",
  chizai: "知的財産法",
  rodo: "労働法",
  kankyo: "環境法",
  "kokusai-ko": "国際関係法（公法系）",
  "kokusai-shi": "国際関係法（私法系）",
} as const;

export type SubjectId = keyof typeof SUBJECTS;

export const SELECTIVE: SubjectId[] = ["tosan", "sozei", "keizai", "chizai", "rodo", "kankyo", "kokusai-ko", "kokusai-shi"];

/** 司法試験の「系」の科目と、その中の第N問の科目 */
export const SECTIONS = {
  公法系科目: ["kenpo", "gyosei"],
  民事系科目: ["minpo", "shoho", "minso"],
  刑事系科目: ["keiho", "keiso"],
} as const satisfies Record<string, SubjectId[]>;

export type SectionName = keyof typeof SECTIONS | "選択科目";

const NAME_TO_ID = new Map<string, SubjectId>(
  Object.entries(SUBJECTS).map(([id, label]) => [compact(label).replace(/[（）()]/g, ""), id as SubjectId]),
);
NAME_TO_ID.set("民事", "jitsumu-minji");
NAME_TO_ID.set("刑事", "jitsumu-keiji");
NAME_TO_ID.set("一般教養", "ippan");

/** 「［倒 産 法］」「［法律実務基礎科目（民事 ］ ）」のような見出しから科目 id を得る */
export function subjectFromHeading(heading: string): SubjectId | null {
  const key = compact(heading).replace(/[［］\[\]（）()]/g, "");
  return NAME_TO_ID.get(key) ?? null;
}

export function sectionFromHeading(heading: string): SectionName | null {
  const key = compact(heading).replace(/[【】［］\[\]]/g, "");
  if (key === "選択科目") return "選択科目";
  return key in SECTIONS ? (key as SectionName) : null;
}
