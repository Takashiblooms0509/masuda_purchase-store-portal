# Supabase初期設定（Phase1）

対象プロジェクト：masuda_purchase_store_portal。
URL：`https://suzcamfdmgeqnelvhabo.supabase.co`。
コードとローカルSQLテストは用意済み。実プロジェクトへの適用はユーザーが行う。
DBパスワード、Secret/Service Role Key、パスワードをチャットへ送る必要はない。

## 1. DB作成
【ユーザー作業】
1. [Supabase Dashboard](https://supabase.com/dashboard)を開き、上記プロジェクトを選ぶ。
2. 左メニューのTable Editorでstores / profilesが既存でないことを確認する。既存であればSQLを実行せずCodexへテーブル名だけ知らせる。
3. SQL Editor → New queryへ移動し、リポジトリの `supabase/migrations/202610010001_phase1_auth_stores.sql` の内容をすべて貼り付けてRunを押す。成功後に同じSQLを再実行しない。
4. Codexへ「migration成功」と返す。エラーの場合は個人情報を含まないエラー文だけ返す。

SQLはbegin/commitで一括適用する。競合・エラーがあれば途中で停止する。
手動SQL Editorでの実行はSupabase CLIのmigration履歴に自動登録されない。
後からCLI運用へ移行する場合、適用済みバージョンを `supabase migration repair 202610010001 --status applied` で整合させる必要がある。移行時にCodexへ相談する。

## 2. 認証設定
【ユーザー作業】
1. 同じSupabaseプロジェクトを開く。
2. Authentication → Sign In / Providers（画面によってProviders）へ移動する。
3. Email / Passwordを有効にし、「Allow new users to sign up」を無効にする。管理者発行のみの業務アプリとして使う。Anonymous Sign-insは無効のままにする。
4. 設定保存後、Codexへ「Email認証有効・公開サインアップ無効」と返す。

Phase1では確認メール・メールリンク経由ログインを使わない。UIにサインアップは設けていない。
後続の招待・パスワード再設定メールを使う場合はSMTPと許可Redirect URLも設定する。

## 3. 最初の管理者アカウント
【ユーザー作業】
1. 同じプロジェクトのAuthenticationを開く。
2. Users → Add user → Create new userへ移動する。
3. 管理者のメールアドレスと安全なパスワードを入力し、メール確認済みとして作成する（Auto Confirm Userがある場合はオン）。作成されたUser UIDをコピーする。次のSQL内で自分で使い、チャットにパスワードを送らない。
4. Codexへ「管理者Authユーザー作成済み」と返す。

Auth作成だけではログイン後に「利用設定を確認してください」と表示される。次の手順で有効adminへ変更する。

## 4. 初期店舗とadmin設定
【ユーザー作業】
1. 同じプロジェクトのSQL Editorを開く。
2. New queryへ移動する。
3. 下記SQLの `実際の店舗コード` / `実際の店舗名` / `実際の管理者名` / UUIDを自分の値へ置き換えてRunを押す。UUIDは前の手順のUser UID。店舗名・コードは未指定なのでコード側では決めていない。
4. 下の確認SQLでrole=admin・is_active=trueになっていることを確認し、Codexへ「初期店舗・管理者設定完了」と返す。氏名やメールを含む結果を貼り付ける必要はない。

```sql
begin;
insert into public.stores(code, name)
values ('実際の店舗コード', '実際の店舗名');

update public.profiles
set name = '実際の管理者名', role = 'admin', is_active = true
where id = 'ここをUser UIDに置き換える'::uuid;
commit;
```

```sql
select role, is_active from public.profiles
where id = 'ここをUser UIDに置き換える'::uuid;
```

店舗コードは30文字以内・重複不可、店舗名は100文字以内。
profilesが0件ならUser UIDと対象プロジェクトを再確認する。
この初期化SQLも一度のみ実行する。最後の有効adminを無効化しない。
ポータルUIは自分自身の管理者解除・無効化を防ぐが、SQL EditorはRLSを回避できるため慎重に操作する。

## 5. スタッフ追加
【ユーザー作業】
1. SupabaseのAuthentication → Usersを開く。
2. Add user → Create new userへ移動する。
3. 各スタッフのメールとパスワードを設定し、メール確認済みで作成する。ポータルにadminでログイン → ユーザー管理 → 対象者の「設定する」で氏名・スタッフ権限・所属店舗を選び「利用を有効にする」をオンにして保存する。
4. Codexへ「スタッフのログイン確認完了」と返す。パスワードは共有しない。

無効化された店舗のstaffは業務データへアクセスできない。
メール変更・パスワード再発行はPhase1ではSupabase管理者操作。

## 6. ローカル起動
環境変数はアプリのルートである `app/.env.local` に設定する。

```bash
cp .env.example app/.env.local
cd app
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)を開く。
提供済みProject URL・Publishable Keyが.env.exampleに入っているのでPhase1では秘密キー追加は不要。
OPENAIの2変数はPhase4まで空欄。Service Role Key/Secret Keyは設定しない。

## 7. 実プロジェクト検証
【ユーザー作業】
1. 起動したポータルを開く（ローカルまたはVercel URL）。
2. 管理者でログインし、店舗管理・ユーザー管理が表示されることを確認する。
3. staffでログインし管理メニューがなく、`/admin/stores`へ直接移動しても戻されることを確認する。無効staffでは業務画面へ入れないことを確認する。2店舗を使う場合は各staffの表示が自店に限定されることも確認する。
4. Codexへ実施した確認と成功/失敗を返す。顧客情報・パスワード・トークンは送らない。

自動SQLテストはPGliteのPostgreSQLで実migrationを実行しRLSを検証する。
実SupabaseのAuthサービス・REST権限・Cookie認証を含む最終確認は上記で行う。

## OpenAI設定（Phase4まで作業不要）
Phase1ではOpenAIを呼び出さない。
Phase4で [OpenAI API Platform](https://platform.openai.com/) のAPIプロジェクトを作成し、
Billing / Limitsで予算・通知を設定、API Keysでキーを作成する。
キーは `app/.env.local` およびVercel Environment Variablesの `OPENAI_API_KEY` へ自分で入力する。
`NEXT_PUBLIC_`を付けない。`OPENAI_MODEL`は画像・JSON Schema対応モデルを実装時に選定する。
キーをCodexやGitHubへ貼り付けない。画像送信・保存方針は実装前に確認する。
