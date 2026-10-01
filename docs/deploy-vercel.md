# Vercelデプロイ手順

Phase1の公開と本番admin/staffログイン・権限制御はユーザー確認済み。
本番URL：[買取店管理ポータル](https://masuda-purchase-store-portal.vercel.app)。
以下は初回設定の手順。後続Phaseではプロジェクトを作り直さず、[Phase2手順](phase2-setup.md) / [Phase3手順](phase3-setup.md)の追加SQLを先に実施する。
Supabase初期設定を先に完了する： [setup-supabase.md](setup-supabase.md)。

【ユーザー作業】
1. [Vercel](https://vercel.com/)へGitHubアカウントでログインする。
2. Add New → Project → Import Git Repositoryへ進み、`Takashiblooms0509/masuda_purchase-store-portal`を選ぶ。表示されない場合はGitHubアプリのリポジトリアクセスを設定する。
3. Framework PresetをNext.js、Root Directoryを **app** にする。Node.jsは24.xを選ぶ。Install / Build / Output設定はNext.jsの既定値（npm ci / npm run build）を使う。
4. Environment Variablesに下記2項目を入力する。Production / Preview / Developmentを選択し、Deployを押す。Codexへ公開URLと「デプロイ成功」を返す。失敗時は秘密情報を除いたエラー部分だけ返す。

| Name | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://suzcamfdmgeqnelvhabo.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | sb_publishable_aAO1v5w06tupuCjXlRt5xA_ERj2bcNB |

環境変数変更後はRedeployが必要。秘密情報はソースに書かない。
Phase1〜Phase3ではOpenAI API Key、Supabase Secret/Service Role Key、DBパスワードの設定は不要。
後続PhaseでOPENAI_API_KEY / OPENAI_MODELをサーバー専用変数として設定する。

## GitHubの反映
変更がPRとして提示された場合、Files changedで内容を確認し、Phase1をmainへマージしてから本番Deployする。
PRのPreviewを使う場合、個人情報を扱う検証データを公開サインアップなどで開放しない。
可能なら検証用Supabaseプロジェクトを用意し、Previewの環境変数を分ける。
Previewもアプリ内認証・RLSで保護されるが、本番DBへ接続した状態でテスト更新すると本番データが変わる。

## Supabase URL設定
【ユーザー作業】
1. Supabase Dashboardで対象プロジェクトを開く。
2. Authentication → URL Configurationへ移動する。
3. Site URLへVercelの本番URLを設定する。Phase1のパスワード認証はメールコールバックを使わないため、広いワイルドカードRedirect URLを追加する必要はない。
4. Codexへ「Site URL設定完了」と返す。

## 公開後の確認
【ユーザー作業】
1. Vercelの公開URLを開く。
2. 未ログインで `/` と `/admin/users` へ進み、ログイン画面へ移動することを確認する。
3. admin・staffそれぞれで [setup-supabase.md](setup-supabase.md) の実プロジェクト検証を行い、ログアウト後に業務画面へ入れないことも確認する。
4. Codexへ確認結果を返す。パスワードや業務データは送らない。

## ログ
氏名・住所・電話番号・パスワード・認証トークン・画像をログに出さない。
本実装は外部サービスの生エラーを表示/記録せず、操作別の一般的なエラーだけを表示する。
Vercelのログを共有する場合も秘密情報や個人情報がないか確認する。
