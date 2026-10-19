/**
 * 法務省ウェブサイトの資料を表示するときの出典表記。
 * 同サイトの利用規約（公共データ利用規約 第1.0版）は出典の記載を求め、編集・加工した場合はその旨の記載も求めている。
 * 取り込み時に PDF からテキスト化し改行などを整えているため「加工して作成」と記す。
 */
export function SourceNote({ url, className = "" }: { url: string; className?: string }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      出典：法務省ウェブサイト（
      <a href={url} target="_blank" rel="noreferrer" className="break-all underline">
        {url}
      </a>
      ）を加工して作成
    </p>
  );
}
