import { LegalPage, Todo } from "@/components/LegalPage";

export const metadata = { title: "特定商取引法に基づく表記 | 司法試験 AI添削" };

// Stripe の本番利用申請でも、このページの URL の登録を求められる
const ROWS: [string, React.ReactNode][] = [
  ["販売業者", <Todo key="a">氏名または法人名</Todo>],
  ["運営統括責任者", <Todo key="b">氏名</Todo>],
  ["所在地", <Todo key="c">住所</Todo>],
  ["電話番号", <Todo key="d">電話番号（受付時間も記載）</Todo>],
  ["メールアドレス", <Todo key="e">問い合わせ用メールアドレス</Todo>],
  [
    "販売価格",
    "添削チケット1通 800円、5通パック 3,600円、スタンダード（月額）4,980円、無制限（月額）9,800円（いずれも税込）",
  ],
  ["商品代金以外の必要料金", "インターネット接続に必要な通信料はお客様のご負担となります。"],
  ["支払方法", "クレジットカード（Stripe による決済）"],
  ["支払時期", "チケット: 購入時に決済。月額プラン: 登録時および毎月の更新日に自動で決済。"],
  ["サービスの提供時期", "決済完了後、直ちにご利用いただけます。"],
  [
    "返品・キャンセル",
    <>
      デジタルサービスの性質上、購入後の返金はお受けしていません。月額プランは会員情報ページからいつでも解約でき、解約後も当該請求期間の終了まで利用できます。
      <Todo key="f">返金ポリシーを確定</Todo>
    </>,
  ],
  ["動作環境", "最新版の Google Chrome、Safari、Microsoft Edge、Firefox"],
];

export default function TokushohoPage() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
      <dl className="divide-y divide-line">
        {ROWS.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="font-bold text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </LegalPage>
  );
}
