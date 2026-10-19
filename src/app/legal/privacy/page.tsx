import { LegalPage, Todo } from "@/components/LegalPage";

export const metadata = { title: "プライバシーポリシー | 司法試験 AI添削" };

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー">
      <p>
        <Todo>公開前に専門家の確認を受けたプライバシーポリシーの本文に置き換えてください。</Todo>
      </p>
      <p>本サービスが取得・利用する情報は、現在の実装では次のとおりです。</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Googleアカウントのメールアドレスと表示名（ログインのため）</li>
        <li>提出された答案と添削結果、短答の回答履歴（学習履歴の表示のため）</li>
        <li>決済情報（Stripe が処理し、本サービスはカード番号を保持しません）</li>
      </ul>
      <p>外部への提供先（委託先）:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Anthropic（答案の添削・PDFの文字起こしのため、答案本文を送信）</li>
        <li>Stripe（決済）</li>
        <li>Vercel（ホスティング）、データベースの提供事業者</li>
      </ul>
    </LegalPage>
  );
}
