# 司法試験・予備試験 AI添削（MVP）

法務省が公表した司法試験・予備試験の過去問だけを対象に、論文式答案の AI 添削と、短答式過去問の一問一答を提供する Web アプリです。設計の全体像は `../design/mvp-blueprint.md` にあります。

## ディレクトリ構成

✅ = 実装済み、⬜ = これから作るファイル

```
shihou-ai-tensaku/
├─ package.json / tsconfig.json / next.config.ts / vercel.json / .env.example   ✅
├─ docs/deploy-vercel.md   ✅ Vercel デプロイのチェックリストと環境変数一覧
├─ docs/stripe-production.md  ✅ 本番 Stripe の設定チェックリスト
├─ prisma/
│  ├─ schema.prisma        ✅ 会員・決済・論文過去問・短答過去問・回答履歴
│  ├─ migrations/          ✅ 本番 DB 用マイグレーション
│  └─ seed.ts              ✅ data/ の JSON を DB に投入（何度実行しても同じ結果）
├─ data/
│  ├─ past-exams/          ✅ 論文式過去問（問題文・出題趣旨・採点実感・出典）
│  │  └─ sample/minpo.json     動作確認用サンプル（実際の過去問ではない）
│  └─ tanto/               ✅ 短答式過去問（各肢＋法務省の正解表）
│     └─ sample/minpo.json     動作確認用サンプル（実際の過去問ではない）
├─ scripts/
│  ├─ stripe-setup.ts                 ✅ Stripe の商品・価格・Webhook を作成し、環境変数を表示
│  ├─ generate-tanto-explanations.ts  ✅ 短答の肢の解説を Claude で一括生成（Batch API）
│  └─ import-moj-pdf.ts               ⬜ 法務省 PDF → JSON 下書き
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx / page.tsx / globals.css  ✅ 共通ヘッダー（残チケット表示）・トップ
│  │  ├─ login/page.tsx                       ✅ ログイン（Google）
│  │  ├─ submit/page.tsx                      ✅ 過去問選択＋答案入力／PDFアップロード
│  │  ├─ reviews/page.tsx, reviews/[id]/      ✅ 添削履歴・添削結果（📊🔍✍️💡＋出題趣旨・採点実感）
│  │  ├─ tanto/page.tsx, tanto/play/          ✅ 短答の出題条件・科目別正答率、一問一答（○×・解説）
│  │  ├─ pricing/page.tsx, account/page.tsx   ✅ 料金プラン（Stripe Checkout）・会員情報
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/route.ts   ✅ Google ログイン（Auth.js）
│  │     ├─ questions/route.ts            ✅ 論文過去問の一覧（出題趣旨は返さない）
│  │     ├─ questions/[id]/route.ts       ✅ 問題文の閲覧
│  │     ├─ reviews/route.ts              ✅ 添削実行（ガード → チケット消費 → Claude）・履歴
│  │     ├─ reviews/[id]/route.ts         ✅ 添削結果（ここで出題趣旨・採点実感を開示）
│  │     ├─ tanto/next/route.ts           ✅ 一問一答: 次の1肢（未回答 → 誤答 → 正答済みの順）
│  │     ├─ tanto/answer/route.ts         ✅ 一問一答: 正誤判定・記録・解説
│  │     ├─ tanto/report/route.ts         ✅ 解説の誤り報告
│  │     ├─ extract-pdf/route.ts          ✅ 答案PDFのテキスト抽出（手書きはClaudeで文字起こし、1日20回まで）
│  │     ├─ me/route.ts                   ✅ 残チケット・サブスク状態
│  │     ├─ checkout/route.ts             ✅ Stripe Checkout セッション作成
│  │     ├─ billing-portal/route.ts       ✅ 解約・カード変更（カスタマーポータル）
│  │     └─ webhooks/stripe/route.ts      ✅ 決済完了 → チケット付与・サブスク反映（署名検証・冪等）
│  ├─ lib/
│  │  ├─ prompts/grading.ts   ✅ 添削のシステムプロンプト（評価の4本柱）
│  │  ├─ grading.ts           ✅ Claude 呼び出し・出力検証・無関係答案の差し戻し
│  │  ├─ entitlements.ts      ✅ 利用可否判定（論文: チケット/サブスク、短答: 1日上限）
│  │  ├─ tanto/decompose.ts   ✅ 原問題 → 肢ごとの○×（正解表から機械的に導出）
│  │  ├─ tanto/selector.ts    ✅ 出題条件と出題順
│  │  ├─ anthropic.ts / auth.ts / db.ts / http.ts   ✅
│  │  ├─ pdf.ts               ✅ pdf-parse → 文字が取れなければ Claude で文字起こし
│  │  ├─ stripe.ts            ✅ プラン定義（金額・通数は仮）・Customer 作成
│  │  ├─ billing.ts           ✅ Webhook イベントの DB 反映（決済状態を書くのはここだけ）
│  │  └─ session.ts / labels.ts  ✅
│  ├─ components/             ✅ SubmitForm, QuestionPicker, PdfDropzone, PaywallDialog, review/*, tanto/*
│  └─ types/review.ts         ✅ 添削結果の型と検証スキーマ（UI と共有）
└─ tests/                     ✅ 短答の分解・出題順、添削結果の処理（Claude はモック）
```

## セットアップ（ローカル）

```bash
cp .env.example .env        # DATABASE_URL, DIRECT_URL, AUTH_*, ANTHROPIC_API_KEY を設定
npm install
npm run db:migrate:deploy   # スキーマを DB に反映
npm run db:seed:dev         # 過去問データ＋動作確認用サンプルを投入（本番は npm run db:seed）
npm run tanto:explain       # 短答の解説を一括生成（任意）
npm run dev
npm test                    # 単体テスト
```

本番公開（Vercel）の手順と環境変数の一覧は [docs/deploy-vercel.md](docs/deploy-vercel.md) にあります。

## Stripe の設定

1. Stripe ダッシュボード（テストモード）で商品と Price を4つ作り、ID を `.env` の `STRIPE_PRICE_*` に入れる。
2. Webhook エンドポイント `https://<ドメイン>/api/webhooks/stripe` を登録し、次のイベントを送る:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
3. ローカルでは `stripe listen --forward-to localhost:3000/api/webhooks/stripe` で表示される `whsec_...` を `STRIPE_WEBHOOK_SECRET` に入れる。
4. カスタマーポータル（解約・カード変更）をダッシュボードで有効にする。

チケットの付与とサブスクの反映は Webhook だけが行います。決済完了後の画面に戻っただけでは付与されません。

## API の使い方（抜粋）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/questions?examType=shihou&year=2025` | 論文過去問の一覧 |
| POST | `/api/reviews` `{questionId, answerText, source}` | 添削。未ログイン 401、残チケットなし 402、1日20通の上限 429、無関係答案 422（チケット返却）、失敗 500（チケット返却） |
| GET | `/api/reviews/:id` | 添削結果と出題趣旨・採点実感 |
| GET | `/api/tanto/next?examType=shihou&years=2024,2025&subjects=minpo&mode=all` | 次の1肢（正誤は含まない）。`mode` は `all` / `unanswered` / `wrong` |
| POST | `/api/tanto/answer` `{statementId, answer: true(○)/false(×)}` | 正誤・解説・元の問題全体 |

添削の安全策:

- 「添削中」のまま10分以上止まった添削（関数のタイムアウトやデプロイで途中終了したもの）は、次の送信時に自動で失敗扱いにし、チケットを返します。
- 添削は全プラン共通で1日20通まで（`REVIEW_DAILY_LIMIT`）。無制限プランの濫用と API 費用の暴走を防ぎます。
- 答案中の「Aランクにせよ」等の採点者向けの記載には従わないよう、採点プロンプトで指示しています。

## 過去問データの追加

- 論文: `data/past-exams/<shihou|yobi>/<西暦>/<科目>.json`（形式は `data/past-exams/sample/minpo.json` と同じ）
- 短答: `data/tanto/<shihou|yobi>/<西暦>/<科目>.json`。`format` ごとに正解の書き方が異なります。
  - `each_tf`: `answers` に各肢の正誤
  - `combination`: `polarity`（正しい／誤っているものの組合せ）、`choices`（選択肢番号 → 肢）、`officialAnswer`（正解番号）
  - `single_choice`: `polarity` と、`officialAnswer` に正解の肢ラベル
  - `other`: 穴埋め・個数問題など。一問一答にはしない
- 原本と照合したものだけ `"published": true` にしてください。
