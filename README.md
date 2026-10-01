# 買取店管理ポータル

顧客・買取・来店・商品明細・原本画像を店舗別に一元管理する業務システム。
Next.js / TypeScript / Supabase PostgreSQL・Auth / Vercel。

現在は **Phase2（顧客・来店取引・商品明細・カテゴリ・原本情報の管理）** まで実装。
本番URL：[買取店管理ポータル](https://masuda-purchase-store-portal.vercel.app)。
Phase2は追加migrationとコード反映が必要。ダッシュボード集計はPhase3、実画像・AI読取はPhase4以降。

## 実装済み
- メール・パスワードログイン、HttpOnly Cookieによるセッション、ログアウト
- 認証・有効ユーザー・有効店舗の確認、保護されたポータル画面
- adminの店舗作成/編集/無効化、利用者の氏名/所属/権限/有効状態の管理
- stores / profiles、Auth同期、RLS、staffの他店舗参照・自己昇格の禁止
- 管理者発行型アカウント（Authユーザー発行はSupabase Dashboard）
- 顧客の登録・検索・編集・本人確認書類情報・来店履歴
- カード番号/電話/氏名/生年月日による既存顧客候補確認（自動統合なし）
- 買取取引と商品明細の一括保存・編集、明細UUID/行順の保持
- 親子カテゴリ管理（admin編集・staff参照）、原本情報管理
- 店舗別RLS、複合FK、顧客来店日の自動更新、SQL/RLSテスト

## 設計レビュー
[Phase1設計レビュー](docs/design-review.md) にシステム構成、ER図、PK/FK、RLS、
ディレクトリ、6段階の開発計画、環境変数、各サービス設定、実装/保留範囲、懸念点を記載。
[DB設計](docs/database.md)に最低限8テーブルの全カラムと関係を記載。
Phase1 migrationはstores / profiles、Phase2 migrationは残り6つの業務テーブルを作成する。
[Phase2の設定・確認手順](docs/phase2-setup.md)を参照。

## 起動
Node.js 24.x推奨（対応範囲22.12以上24.xまで）、npmを使用。

```bash
cp .env.example app/.env.local
cd app
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)を開く。
提供済みSupabase Project URL・Publishable Keyは.env.exampleに設定済み。
アプリの環境変数ファイルは **app/.env.local**。リポジトリルートの.env.localではない。
実Supabaseへmigrationを適用し、初期adminを設定するまで業務画面は利用できない。

## ユーザー作業
[Supabase設定手順](docs/setup-supabase.md)に、サービス・画面・入力内容・Codexへ返す内容を順番に記載。
1. 初回のみSupabaseでPhase1 SQL migrationを適用
2. Email Authを有効化し、公開サインアップを無効化
3. 初期店舗と管理者を作成し、有効adminへ設定
4. 必要に応じてスタッフを作成・所属店舗を設定
5. [Vercel手順](docs/deploy-vercel.md)に沿ってRoot Directory=appでデプロイ
6. Phase1設定済みの場合は [Phase2手順](docs/phase2-setup.md) の追加SQLだけを適用（Phase1の再実行は不要）

DBパスワード・Supabase Secret/Service Role KeyはPhase1・Phase2アプリに不要。
OpenAI API KeyはPhase4で `OPENAI_API_KEY` に設定するまで不要。
秘密情報やパスワードをCodexへ送らない。

## 検証
```bash
cd app
npm run check
```

型チェック → ESLint → Vitest（認証・RLS）→ 本番build。
RLSテストはPGliteのPostgreSQLで実SQLを実行し、Supabase Authのauth.users / auth.uid()を最小限再現する。
実SupabaseのAuth・REST・Cookieを含む確認とは別の検証である。
Phase1の本番公開・admin/staffログインと管理画面権限制御はユーザー確認済み。
Phase2の実Supabase適用・本番動作確認は追加SQL適用後に行う。
CIでは同じチェックを実行する。手動公開後の確認はSupabase手順の「実プロジェクト検証」を参照。

## セキュリティと今後
.env.localはGit管理外。公開用Publishable KeyはRLSと組み合わせる。
権限はprofilesを正とし、staffは自分のprofileを変更できない。
原本画像は後続Phaseで非公開Storage・署名URLへ保存し、AIの結果は必ず人が確認してからDB確定する。
FC Excelの列を内部DBへ直接持ち込まない。販売・卸テーブルは仕様確定後に設計する。
詳細な開発ルールは [AGENTS.md](AGENTS.md)。
