import { LegalPage, Todo } from "@/components/LegalPage";

export const metadata = { title: "利用規約 | 司法試験 AI添削" };

export default function TermsPage() {
  return (
    <LegalPage title="利用規約">
      <p>
        <Todo>公開前に専門家の確認を受けた利用規約の本文に置き換えてください。</Todo>
      </p>
      <p>最低限、次の事項を定めることを想定しています。</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>AIによる添削・推定ランクは実際の試験の採点結果を保証しないこと（免責）</li>
        <li>提出された答案の取り扱い（AIの学習には利用しないこと、削除の方法）</li>
        <li>料金・チケットの有効期限・月額プランの更新と解約</li>
        <li>禁止事項（アカウントの共有、自動化された大量送信、過去問以外の答案の送信など）</li>
        <li>過去問・出題趣旨・採点実感は法務省の公表資料であり、その出典</li>
        <li>サービスの変更・停止、準拠法と管轄裁判所</li>
      </ul>
    </LegalPage>
  );
}
