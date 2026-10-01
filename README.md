# 買取店管理ポータル

顧客・買取・来店・商品明細・原本画像を店舗別に一元管理する業務システム。
Next.js / TypeScript / Supabase PostgreSQL・Auth / Vercel。

現在は **Phase1（認証・店舗・ユーザー・RLS基盤）** の実装。
顧客/買取/AI取込の業務機能はPhase2以降。未確定仕様や対象外機能を先行実装しない。

## 実装済み
- メール・パスワードログイン、HttpOnly Cookieによるセッション、ログアウト
- 認証・有効ユーザー・有効店舗の確認、保護されたポータル画面
- adminの店舗作成/編集/無効化、利用者の氏名/所属/権限/有効状態の管理
- stores / profiles、Auth同期、RLS、staffの他店舗参照・自己昇格の禁止
- 管理者発行型アカウント（Authユーザー発行はSupabase Dashboard）
- PostgreSQLで実migration・RLSを検証する自動テスト

## 設計レビュー
[Phase1設計レビュー](docs/design-review.md) にシステム構成、ER図、PK/FK、RLS、
ディレクトリ、6段階の開発計画、環境変数、各サービス設定、実装/保留範囲、懸念点を記載。
[DB設計](docs/database.md)に最低限8テーブルの全カラムと関係を記載。
Phase1 migrationではstores / profilesのみ作成する。

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
1. SupabaseでPhase1 SQL migrationを適用
2. Email Authを有効化し、公開サインアップを無効化
3. 初期店舗と管理者を作成し、有効adminへ設定
4. 必要に応じてスタッフを作成・所属店舗を設定
5. [Vercel手順](docs/deploy-vercel.md)に沿ってRoot Directory=appでデプロイ

DBパスワード・Supabase Secret/Service Role KeyはPhase1アプリに不要。
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
CIでは同じチェックを実行する。手動公開後の確認はSupabase手順の「実プロジェクト検証」を参照。

## セキュリティと今後
.env.localはGit管理外。公開用Publishable KeyはRLSと組み合わせる。
権限はprofilesを正とし、staffは自分のprofileを変更できない。
原本画像は後続Phaseで非公開Storage・署名URLへ保存し、AIの結果は必ず人が確認してからDB確定する。
FC Excelの列を内部DBへ直接持ち込まない。販売・卸テーブルは仕様確定後に設計する。
詳細な開発ルールは [AGENTS.md](AGENTS.md)。
