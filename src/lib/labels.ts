export const EXAM_TYPE_LABEL: Record<string, string> = {
  shihou: "司法試験",
  yobi: "予備試験",
  sample: "サンプル",
};

export function examTitle(exam: { eraLabel: string; examType: string }) {
  return exam.examType === "sample" ? "サンプル問題" : `${exam.eraLabel}${EXAM_TYPE_LABEL[exam.examType] ?? ""}`;
}
