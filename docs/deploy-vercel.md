# Vercel デプロイ チェックリスト

対象: `shihou-ai-tensaku`（Next.js 15 / Prisma 6 / PostgreSQL / Auth.js v5 / Stripe / Claude API）
作成日: 2026-10-19

---

## 0. コード側で対応済みのこと

Vercel で動かすために、次の調整をコードに入れてあります。

| 項目 | 内容 | ファイル |
|---|---|---|
| ビルドスクリプト | `build` = `prisma generate && next build`、`postinstall` = `prisma generate`。Vercel の依存キャッシュで Prisma Client が古いまま残る問題を防ぐ | `package.json` |
| Node のバージョン | `engines.node` = `22.x` | `package.json` |
| DB マイグレーション | 初回マイグレーションを作成（12テーブル）。本番 DB には `npm run db:migrate:deploy` で適用する。空の DB への適用と seed を確認済み | `prisma/migrations/` |
| DB 接続の分離 | アプリ用の `DATABASE_URL`（プーリング接続）と、マイグレーション用の `DIRECT_URL`（直接接続）を分けた | `prisma/schema.prisma` |
| リージョン | 関数を東京（`hnd1`）で動かす。DB も東京リージョンに置くこと | `vercel.json` |
| PDF の上限 | Vercel の関数はリクエスト本体が **4.5MB まで**なので、アップロード上限を 10MB → **4MB** に下げた | `src/lib/pdf.ts` ほか |
| PDF 抽出の同梱漏れ | pdf.js のワーカーファイルは自動では関数に同梱されないため、明示的に含めた。Vercel と同じく必要なファイルだけを同梱した状態で PDF 抽出が動くことを確認済み | `next.config.ts` |
| サンプルデータ | `npm run db:seed` は、動作確認用のサンプル問題を**投入しない**ようにした（ローカルで使うときは `npm run db:seed:dev`） | `prisma/seed.ts` |
| 法務ページ | 特定商取引法に基づく表記・利用規約・プライバシーポリシーのひな形とフッターリンク。**【要記入】の箇所を公開前に埋める** | `src/app/legal/*` |
| 処理時間 | 添削 API の `maxDuration` は 300 秒。Hobby・Pro とも上限内 | `src/app/api/reviews/route.ts` |

---

## 1. 事前に決める・用意するもの

- [ ] **Vercel のプランを Pro にする**。Hobby プランは非商用の個人利用に限られており、有料サービスには使えません（[Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)）。
- [ ] **GitHub リポジトリ**を作り、`shihou-ai-tensaku` のコードを push する（Vercel は GitHub 連携でデプロイするのが最も簡単です）。
- [ ] **本番用 PostgreSQL**（東京リージョン）を用意する。Vercel Marketplace の Neon、または Supabase が手軽です。
  - プーリング接続の URL → `DATABASE_URL`
  - 直接接続の URL → `DIRECT_URL`
- [ ] **独自ドメイン**（例: `example.jp`）。Google ログインと Stripe の設定で URL を使うので、先に決めておくと二度手間になりません。
- [ ] **Anthropic Console** で本番用の API キーを発行し、**月の利用上限（Spend limit）**を設定する。
- [ ] **Google Cloud Console** で本番用の OAuth クライアントを作る（3章）。
- [ ] **Stripe** の本番利用の申請を済ませる（[本番 Stripe 設定チェックリスト](stripe-production.md)）。

---

## 2. 環境変数の一覧

Vercel の **Project → Settings → Environment Variables** に登録します。Production と Preview で値を分けるものは「環境」の列を見てください。

> ご依頼文にあった `NEXTAUTH_SECRET` と `CLAUDE_API_KEY` は、このコードでは **`AUTH_SECRET`** と **`ANTHROPIC_API_KEY`** という名前で読んでいます。この名前で登録してください。

| 変数名 | 必須 | 値の例・取得元 | 環境 | 備考 |
|---|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://...-pooler.../db?sslmode=require` | Production / Preview で別の DB | プーリング接続の URL |
| `DIRECT_URL` | ✅ | `postgresql://.../db?sslmode=require` | 同上 | マイグレーション用の直接接続 URL |
| `AUTH_SECRET` | ✅ | `npx auth secret` で生成した32文字以上のランダム文字列 | Production / Preview で別の値 | 漏れたらすぐ再生成（全員ログアウトになる） |
| `AUTH_GOOGLE_ID` | ✅ | Google Cloud Console の OAuth クライアント ID | 全環境 | 3章 |
| `AUTH_GOOGLE_SECRET` | ✅ | 同 クライアントシークレット | 全環境 | 3章 |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Console | Production / Preview で別のキー推奨 | 利用上限を設定しておく |
| `GRADING_MODEL` | 任意 | `claude-opus-5-5`（既定） | 全環境 | 原価を下げるなら `claude-sonnet-5-5` |
| `EXPLANATION_MODEL` | 任意 | `claude-opus-5-5`（既定） | ― | 解説の一括生成はローカルから実行するので Vercel には不要 |
| `STRIPE_SECRET_KEY` | ✅ | 本番 `sk_live_...` ／ テスト `sk_test_...` | **Production は live、Preview は test** | |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Webhook エンドポイントごとの `whsec_...` | Production / Preview で別の値 | Stripe 側でエンドポイントを登録すると発行される |
| `STRIPE_PRICE_TICKET_1` | ✅ | `price_...`（800円・一回払い） | Production / Preview で別の値 | live と test で Price ID が異なる |
| `STRIPE_PRICE_TICKET_5` | ✅ | `price_...`（3,600円・一回払い） | 同上 | |
| `STRIPE_PRICE_SUB_STANDARD` | ✅ | `price_...`（4,980円/月） | 同上 | |
| `STRIPE_PRICE_SUB_UNLIMITED` | ✅ | `price_...`（9,800円/月） | 同上 | |

Vercel では登録が**不要**なもの:

- `AUTH_URL` / `NEXTAUTH_URL`、`AUTH_TRUST_HOST`: Vercel 上では Auth.js が URL を自動で判定します。
- `SEED_SAMPLES`: 本番では設定しないこと（サンプル問題が公開されてしまいます）。

---

## 3. Google ログイン（OAuth）の設定

- [ ] Google Cloud Console → 「API とサービス」→「認証情報」→ OAuth クライアント ID（ウェブアプリケーション）を作成
- [ ] **承認済みの JavaScript 生成元**: `https://<本番ドメイン>`
- [ ] **承認済みのリダイレクト URI**: `https://<本番ドメイン>/api/auth/callback/google`
- [ ] OAuth 同意画面を「本番環境」に公開する（テストのままだと登録したテストユーザーしかログインできません）。同意画面にはプライバシーポリシーと利用規約の URL（`/legal/privacy`、`/legal/terms`）を登録する
- [ ] Preview でもログインを試すなら、Preview 用のドメインを別途登録するか、Preview 用に別の OAuth クライアントを作る

---

## 4. デプロイ手順

1. [ ] GitHub にリポジトリを作り、コードを push する（`.env` はコミットしない。`.gitignore` 済み）
2. [ ] Vercel で **Add New → Project** からリポジトリを選ぶ。Framework は Next.js が自動で選ばれ、Build Command は `npm run build` のままでよい
3. [ ] 2章の環境変数を登録する
4. [ ] 本番 DB にスキーマを作る（手元のターミナルから。`DIRECT_URL` と `DATABASE_URL` に本番の値を入れて実行）

   ```bash
   npm run db:migrate:deploy
   ```

   マイグレーションはビルド時に自動実行していません。Preview のデプロイが本番 DB を書き換える事故を防ぐためです。スキーマを変えたときは、デプロイの前にこのコマンドを本番 DB に対して実行します。
5. [ ] 過去問データを投入する（法務省の資料から作った JSON を `data/` に置いて実行。サンプルは入りません）

   ```bash
   npm run db:seed
   npm run tanto:explain   # 短答の解説を一括生成する場合
   ```

6. [ ] Deploy を実行し、ビルドが通ることを確認する
7. [ ] Settings → Domains で独自ドメインを追加し、DNS を設定する
8. [ ] Stripe の Webhook エンドポイントに `https://<本番ドメイン>/api/webhooks/stripe` を登録し、発行された `whsec_...` を `STRIPE_WEBHOOK_SECRET` に入れて再デプロイする（`npm run stripe:setup` で自動作成できます。詳細は [本番 Stripe 設定チェックリスト](stripe-production.md)）

---

## 5. 公開前の動作確認

Preview（Stripe はテストモード）で一通り確認してから Production に出します。

- [ ] Google でログインできる・ログアウトできる
- [ ] 過去問一覧が表示される（サンプル問題が出ていないこと）
- [ ] チケット0枚で添削を送ると購入ダイアログが出る
- [ ] テストカード `4242 4242 4242 4242` で購入 → 数秒でヘッダーの残チケットが増える
- [ ] 添削を1回実行し、結果画面が表示される（実際の Claude API での初回確認）
- [ ] 文字の入った PDF と、手書きスキャンの PDF の両方で読み取れる
- [ ] 4MB を超える PDF で「4MBまでです」と表示される
- [ ] 短答一問一答で回答・解説・次へが動く
- [ ] 月額プランに登録 → 会員情報ページから解約できる
- [ ] Vercel の **Deployment Protection**（Vercel Authentication）を Preview で有効にしている場合、Stripe からの Webhook が届かないので、テスト時は保護を外すか、保護をバイパスする設定を使う
- [ ] 特定商取引法に基づく表記・利用規約・プライバシーポリシーの【要記入】がすべて埋まっている

---

## 6. 公開後の運用

- [ ] Vercel の Runtime Logs で `grading failed` / `stripe webhook failed` を定期的に確認する（Pro はログを1日保持）
- [ ] Stripe ダッシュボードの Webhook 画面で、失敗した配信がないか確認する（失敗分は Stripe が自動で再送し、こちらは二重付与しない作り）
- [ ] Anthropic Console で原価を確認する。添削1回あたりのトークン数は `Review.usage` に保存している
- [ ] Vercel の Spend Management で月の上限を設定する
- [ ] DB のバックアップ（Neon / Supabase の自動バックアップ）が有効か確認する
