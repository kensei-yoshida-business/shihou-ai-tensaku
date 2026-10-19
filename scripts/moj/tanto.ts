/**
 * 短答式の問題 PDF のテキストを1問ずつに分け、柱書・肢・選択肢・解答欄番号を取り出す。
 * 一問一答にできるかどうか（形式）は、柱書の文言と選択肢の形から厳しめに判定し、
 * 少しでも当てはまらなければ "other"（一問一答にしない）とする。
 */
import { toAscii, visualLength } from "./normalize";

export type ParsedFormat =
  | "each_tf" // 各肢の正誤を解答欄ごとに答える（正しいものには１を、誤っているものには２を）
  | "tf_combination" // 各肢の○×の組合せを選ぶ（１．ア○ イ× ウ○ …）
  | "combination" // 正しい（誤っている）肢の組合せを選ぶ（１．ア イ ２．ア エ …）
  | "single_choice" // １から５までの記述から正しい（誤っている）ものを1つ選ぶ
  | "multi_choice" // １から５までの記述から正しい（誤っている）ものを2つ選ぶ（順不同）
  | "other";

export type ParsedTantoQuestion = {
  number: number;
  points: number | null;
  /** 柱書（事例などの前提を含む。肢と選択肢は含まない） */
  stem: string;
  statements: { label: string; text: string }[];
  /** combination: 選択肢番号 → 肢ラベル。tf_combination: 選択肢番号 → 肢ラベルごとの○× */
  choices: Record<string, string[]> | null;
  tfChoices: Record<string, Record<string, boolean>> | null;
  /** 解答欄番号（No）。each_tf では肢の順 */
  nos: number[];
  format: ParsedFormat;
  /** 選ぶのが正しいものか誤っているものか */
  polarity: "correct" | "incorrect" | null;
  /** other にした理由 */
  note?: string;
};

const KANA = "アイウエオカキクケコサシスセソタチツテト";
const QUESTION_HEAD = /^〔第(\d+)問〕(?:（配点：?(\d+)[^）]*）)?/;
const KANA_ITEM = new RegExp(`^([${KANA}])[．.]\\s*(.*)$`);
const NUM_ITEM = /^([1-9])[．.]\s*(.*)$/;
/** 選択肢1つ分。「１．ア イ」「１．アとイ」「１．アイ」「１．ア○ イ× ウ○」 */
const CHOICE = new RegExp(`([1-9])[．.]\\s*((?:[${KANA}][○×]?\\s*[と・、]?\\s*)+)`, "g");
const CHOICE_LINE = new RegExp(`^(?:[1-9][．.]\\s*(?:[${KANA}][○×]?\\s*[と・、]?\\s*)+)+$`);
const NO_MARK = /[［\[][，,]?\s*(?:No|№)\.?\s*(\d+)\s*[）)]?\s*[］\]]/g;
import { GARBLED } from "./items";
export { GARBLED };

type RawQuestion = { number: number; head: string; body: string[]; heading: string | null };

/** 1問ごとに分ける。直前の科目見出し（［憲法］など）も返す */
export function splitQuestions(raw: string): RawQuestion[] {
  const lines = raw
    .replace(/\r/g, "")
    .split(/\n|\f/)
    .map((l) => l.replace(/^\s*[-－‐]\s*[０-９\d]+\s*[-－‐]\s*/, "").replace(/[ \t　]+/g, " ").trim())
    // 前の問の最後の行と「〔第15問〕（配点：２）」が同じ行に並んで抽出されることがある
    .flatMap((l) => l.replace(/(.)(〔第[０-９\d]+問〕（配点)/g, "$1\n$2").split("\n"));
  const out: RawQuestion[] = [];
  let heading: string | null = null;
  for (const l of lines) {
    // 「［憲法］」。ページ番号と同じ行に「［憲法］［」のように崩れて抽出されることもある
    const h = l.match(/^[［\[]([^］\]]+)[］\]][［\[\s]*$/);
    if (h && !/^(No|№|ＮＯ|Ｎｏ)/.test(h[1])) {
      heading = h[1].replace(/\s/g, "");
      continue;
    }
    const q = toAscii(l).match(QUESTION_HEAD);
    if (q) {
      out.push({ number: Number(q[1]), head: toAscii(l), body: [l.slice(q[0].length)].filter(Boolean), heading });
      continue;
    }
    out[out.length - 1]?.body.push(l);
  }
  return out;
}

/**
 * 柱書の行をつなぐ。PDF の行幅で折り返された行（柱書の中で最も長い行と同じくらいの長さの行）は次の行と続け、
 * 短く終わった行や、見出し・条文・箇条で始まる行の前では改行を残す
 */
function joinStemLines(lines: string[]): string {
  const width = Math.max(0, ...lines.map((l) => visualLength(l)));
  const block = /^(【|〔|［|[（(]参照条文|[（(][0-9０-９]+[）)]|[⑴-⒇①-⑳]|[Ａ-Ｚ甲乙丙丁][：:．.]|〈|＜|第[０-９\d一二三四五六七八九十]+条|[０-９\d]+[．.])/;
  let out = "";
  let prev = "";
  for (const line of lines) {
    if (!line) continue;
    const wrapped = prev && visualLength(prev) >= width - 2 && !/[。：]$/.test(prev) && !block.test(line);
    out += (out && !wrapped ? "\n" : "") + line;
    prev = line;
  }
  return out;
}

/** 判定用の正規化: 全角数字→半角、「〇」（漢数字のゼロ）→「○」、No の表記ゆれ */
const normalizeMarks = (s: string) => toAscii(s).replace(/〇/g, "○").replace(/Ｎｏ|ＮＯ|NO/g, "No").replace(/．/g, ".");

export function parseQuestion(q: RawQuestion): ParsedTantoQuestion {
  const points = Number(q.head.match(QUESTION_HEAD)?.[2]) || null;
  const stemLines: string[] = [];
  const kana: { label: string; text: string[] }[] = [];
  const nums: { label: string; text: string[] }[] = [];
  const choiceLines: string[] = [];
  let mode: "stem" | "kana" | "num" | "choices" = "stem";

  // 判定は全角数字を半角にした行で行い、取り出す文字列は原文のまま
  const rest = (line: string, m: RegExpMatchArray) => line.slice(line.length - m[2].length);
  for (const line of q.body) {
    if (!line) continue;
    const a = toAscii(line).replace(/〇/g, "○");
    if (CHOICE_LINE.test(a) && (kana.length > 0 || mode === "choices")) {
      choiceLines.push(a);
      mode = "choices";
      continue;
    }
    const k = a.match(KANA_ITEM);
    // 肢は ア から順に並ぶ。順番どおりのものだけを肢とみなす（事例中の「ア．」などを拾わない）
    if (k && k[1] === KANA[kana.length] && mode !== "num" && mode !== "choices") {
      kana.push({ label: k[1], text: [rest(line, k)] });
      mode = "kana";
      continue;
    }
    const n = a.match(NUM_ITEM);
    if (n && Number(n[1]) === nums.length + 1 && mode !== "kana" && mode !== "choices") {
      nums.push({ label: n[1], text: [rest(line, n)] });
      mode = "num";
      continue;
    }
    if (mode === "stem") stemLines.push(line);
    else if (mode === "kana") kana[kana.length - 1].text.push(line);
    else if (mode === "num") nums[nums.length - 1].text.push(line);
    else choiceLines.push(a);
  }

  const stripMark = (s: string) => s.replace(/\s*[［\[](?:No|№|Ｎｏ|ＮＯ)[.．]?\s*[０-９\d]+\s*[］\]]\s*$/, "").trim();
  // 肢の間や後ろに置かれた「（参照条文）」は、肢の正誤を判断する前提なので柱書に移す
  const items = kana.length ? kana : nums;
  const references: string[] = [];
  for (const item of items) {
    const at = item.text.findIndex((l) => /[（(]参照条文[）)]/.test(l));
    if (at < 0) continue;
    const line = item.text[at];
    const col = line.search(/[（(]参照条文[）)]/);
    references.push(line.slice(col), ...item.text.slice(at + 1));
    item.text = [...item.text.slice(0, at), line.slice(0, col)].filter((l) => l.trim());
  }
  const stem = joinStemLines([...stemLines, ...references]);
  const flat = normalizeMarks(stemLines.join(""));
  const marks = [...flat.matchAll(NO_MARK)].map((m) => Number(m[1]));
  const range = flat.match(/[［\[](?:No|№)\.?\s*(\d+)\s*[］\]]\s*から\s*[［\[](?:No|№)\.?\s*(\d+)\s*[］\]]/);
  if (GARBLED.test(stem) || [...kana, ...nums].some((s) => GARBLED.test(s.text.join(""))) || GARBLED.test(choiceLines.join(""))) {
    return { number: q.number, points, stem, statements: [], nos: [], choices: null, tfChoices: null, format: "other", polarity: null, note: "文字化け" };
  }
  const nos = range
    ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i)
    : [...new Set(marks)];
  const statements = items.map((s) => ({ label: s.label, text: stripMark(s.text.join("")) }));
  const base = { number: q.number, points, stem, statements, nos, choices: null, tfChoices: null };
  const other = (note: string): ParsedTantoQuestion => ({ ...base, format: "other", polarity: null, note });

  if (statements.some((s) => !s.text)) return other("肢の文を読み取れない");
  if (/幾つ|個数|いくつ/.test(flat)) return other("個数問題");
  if (/並べ|順序|順番に|空欄|（\s*）内|（\s*）に|語句群|【会話】|【発言】|対話|教授と学生|【見解|見解[ⅠⅡＡＢ]|[ａｂ]の見解|会話|図[1-9１-９]|下図/.test(flat))
    return other("穴埋め・並べ替え・見解・会話などの形式");

  // 「正しいもの」「誤っているもの」のどちらを選ぶか。両方出てくる・どちらも出てこない柱書は判定しない
  const polarity = (s: string): "correct" | "incorrect" | null => {
    const c = /正しいもの|正しい記述/.test(s);
    const w = /誤っているもの|誤りであるもの|誤っている記述|正しくないもの/.test(s);
    return c === w ? null : c ? "correct" : "incorrect";
  };
  const choiceText = choiceLines.join(" ");

  // ○×の組合せ: 「正しいものには○、誤っているものには×を付した場合の組合せ」
  if (kana.length >= 2 && /正しい(?:もの|場合)(?:に|には)、?○.{0,10}?誤っている(?:もの|場合)(?:に|には)、?×/.test(flat)) {
    const tfChoices: Record<string, Record<string, boolean>> = {};
    for (const m of choiceText.matchAll(CHOICE)) {
      const marks = [...m[2].matchAll(new RegExp(`([${KANA}])([○×])`, "g"))];
      tfChoices[m[1]] = Object.fromEntries(marks.map((x) => [x[1], x[2] === "○"]));
    }
    const labels = kana.map((s) => s.label);
    const ok =
      Object.keys(tfChoices).length >= 3 &&
      Object.values(tfChoices).every((c) => labels.every((l) => l in c) && Object.keys(c).length === labels.length);
    if (!ok) return other("○×の組合せの選択肢を読み取れない");
    if (nos.length !== 1) return other("解答欄が1つでない");
    return { ...base, tfChoices, format: "tf_combination", polarity: "correct" };
  }

  // 肢の組合せ: 「正しいもの（誤っているもの）を組み合わせたものは、後記１から５までのうちどれか」
  if (kana.length >= 3 && /組み合わせたもの|組合せ/.test(flat)) {
    const p = polarity(flat);
    if (!p) return other("組合せ問題だが、正しいもの・誤っているもののどちらを選ぶか判定できない");
    const choices: Record<string, string[]> = {};
    const labels = new Set(kana.map((s) => s.label));
    for (const m of choiceText.matchAll(CHOICE)) choices[m[1]] = [...m[2].replace(/[\s と・、]/g, "")];
    const ok =
      Object.keys(choices).length >= 3 &&
      Object.values(choices).every((ls) => ls.length >= 1 && ls.every((l) => labels.has(l)) && new Set(ls).size === ls.length);
    if (!ok) return other("組合せの選択肢を読み取れない");
    if (nos.length !== 1) return other("解答欄が1つでない");
    return { ...base, choices, format: "combination", polarity: p };
  }

  // 各肢の正誤: 「（それぞれ）正しいものには１を、誤っているものには２を選びなさい」
  if (kana.length >= 2 && /正しい(?:もの|場合)(?:に|には)1を.{0,10}?誤っている(?:もの|場合)(?:に|には)2を/.test(flat)) {
    if (choiceLines.length) return other("各肢の正誤の形式だが選択肢がある");
    if (nos.length !== kana.length) return other("肢の数と解答欄の数が合わない");
    if (!/順に/.test(flat)) return other("解答欄と肢の対応が読み取れない");
    return { ...base, format: "each_tf", polarity: "correct" };
  }

  // 記述を選ぶ: 「次の１から５までの各記述のうち、正しいものはどれか」「…正しいものを２個選びなさい」
  if (!kana.length && nums.length >= 4 && !choiceLines.length) {
    const p = polarity(flat);
    if (!p) return other("正しいもの・誤っているもののどちらを選ぶか判定できない");
    if (/どれか|１個選び|1個選び|一つ選び|1つ選び/.test(flat) && nos.length === 1) return { ...base, format: "single_choice", polarity: p };
    if (/２個選び|2個選び|二つ選び|2つ選び/.test(flat) && nos.length === 2 && /順不同/.test(flat))
      return { ...base, format: "multi_choice", polarity: p };
    return other("選ぶ数や解答欄が読み取れない");
  }

  return other("一問一答にできる形式として判定できない");
}
