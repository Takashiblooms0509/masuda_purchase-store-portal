# Phase4：画像保存・AI読取・確認内容の保存

Phase3のダッシュボード・エラー一覧・staff集計はユーザー確認済み。
本番は [買取店管理ポータル](https://masuda-purchase-store-portal.vercel.app)。
既存のSupabase・Vercelプロジェクトを使う。Phase1〜Phase3のSQLは再実行しない。

## 今回使える機能

- 買取計算書のJPG・JPEG・PNGをアップロードし、非公開Storageに保存する。
- 画像保存後、OpenAI Responses APIでJSON Schemaに従って読み取る。
- 原本を左、編集フォームを右に表示し、顧客・来店・複数商品明細を確認・修正する。
- AI原読取値はai_result、人の確認内容はreviewed_resultへ別々に保存する。
- 読取失敗・利用上限・タイムアウトをエラー一覧へ表示し、再処理する。
- 顧客詳細から本人確認書類画像を複数保存・参照する。この画像はOpenAIへ送らない。

「確認内容を保存」は確認用データの保存。顧客・取引・商品明細への確定登録はPhase5で追加する。
既存の手入力による顧客・取引登録は引き続き利用できる。
カード番号の自動認識と単独の「不」の判定は仕様待ちで、確認フォームで手入力する。
帳票上に明示された「成約」「不成約」だけを読み取り対象とする。商品カテゴリ候補はPhase5。
正式な帳票サンプル・認識位置の指定がないため、読取精度は実画像での確認が必要。

## 1. Supabaseの追加SQL

【ユーザー作業】
1. [Supabase Dashboard](https://supabase.com/dashboard)で `masuda_purchase_store_portal` を開く。
2. SQL Editor → New queryへ移動する。
3. [Phase4 SQL](https://github.com/Takashiblooms0509/masuda_purchase-store-portal/blob/codex/phase4-image-reading/supabase/migrations/202610010004_phase4_image_reading.sql)を開き、Rawで全文をコピーし貼り付ける。Runを押し、「Success. No rows returned」を確認する。成功後に同じSQLを再実行しない。
4. 「Phase4 migration成功」と返す。失敗時は秘密情報・個人情報を除いたエラー文を返す。

このSQLは既存テーブルに画像・読取用列と関数を追加し、非公開bucket `portal-source-documents` と店舗別Storage RLSを作る。
既存店舗・顧客・取引は削除しない。Storageの既存RLSを利用するため、新しい業務テーブルは作らない。
bucketを管理画面からPublicにしない。「Allow all」等の広いStorageポリシーを追加しない。
SQL Editorで手動適用した履歴（202610010004）は、将来CLIへ移行する際に整合させる。

## 2. Supabase Secret KeyをVercelへ設定

画像の保存先を限定したアップロードURLの発行とAI処理状態の更新に、サーバー専用キーを使う。
通常の画面・業務データ・画像閲覧は利用者のJWTとRLSを使う。専用キーの処理でも、認証済み利用者の現在の店舗権限をDBで再確認する。

【ユーザー作業】
1. Supabaseで同じプロジェクトを開く。
2. Project Settings（歯車）→ API Keysへ進む。画面によってはSettings → API → API Keysと表示される。
3. Secret keysの `sb_secret_` で始まるSecret Keyをコピーする。未作成ならSecret Keyを作成する。次に[Vercel](https://vercel.com/)で既存プロジェクト → Environment Variablesへ移動し、Nameを `SUPABASE_SECRET_KEY`、Valueをコピーしたキー、対象をProductionと利用するPreview環境にして保存する。`NEXT_PUBLIC_` は付けない。
4. キーそのものは返さず、「Supabase Secret Key設定完了」と返す。

現在の実装は新形式 `sb_secret_...` を使用する。Publishable Keyや旧形式service_roleのJWTをこの欄へ入れない。
Previewで別Supabaseを使う場合は、そのプロジェクトのURL・Publishable Key・Secret Keyを組にする。

## 3. OpenAI APIをVercelへ設定

ChatGPTの契約とOpenAI APIの利用料金・残高は別。API利用可能なプロジェクトとキーが必要。

【ユーザー作業】
1. [OpenAI API管理画面](https://platform.openai.com/)を開き、API用プロジェクトを選ぶ（必要なら作成する）。
2. Billingで支払い方法・利用残高を確認し、API keysへ進む。
3. Create new secret keyでキーを作成する。権限を制限する場合はResponses APIへの書き込みを許可する。キーをVercelの既存プロジェクト → Environment Variablesへ保存する。Nameは `OPENAI_API_KEY`。もう1項目、Nameを `OPENAI_MODEL`、Valueを `gpt-4.1` として保存する。Productionと利用するPreview環境に設定する。モデルの利用権限も確認する。
4. キーは送らず、「OpenAI環境変数設定完了」と返す。

API Key・Secret Key・DBパスワードはソース、GitHub、チャットへ貼らない。
買取計算書は外部のOpenAI APIへ送信される。Responsesの `store:false` を指定するが、提供元の保持方針を無条件にゼロ保存と扱わない。
本人確認書類の単独画像はこの読取機能の対象外。

## 4. コードの反映

【ユーザー作業】
1. Codexが案内するGitHubのPhase4 PRを開く。
2. Files changedで内容、ConversationでCI成功を確認する。
3. SQL成功と3つの環境変数保存後、PRをReady for reviewにしてmainへマージする。Vercel → DeploymentsでmainのProductionがReadyになるまで待つ。環境変数をデプロイ後に変更した場合は対象Deploymentの「…」→ Redeployを実行する。
4. 「Phase4マージ・デプロイ完了」と返す。

追加する環境変数は `SUPABASE_SECRET_KEY` / `OPENAI_API_KEY` / `OPENAI_MODEL`。
既存の公開用2項目はそのまま使う。DBパスワードはアプリに不要。

## 5. 本番で確認する操作

【ユーザー作業】
1. 本番ポータルへadminでログインする。
2. データ取込を開く。顧客情報を含まない検証用の買取計算書画像（JPG・JPEG・PNG、10MB以下）を選び、「画像を保存して読み取る」を押す。
3. 原本と読取結果が左右に出ることを確認する。氏名・明細・成約状態などを修正し「確認内容を保存」を押す。再読込後も修正が残ること、顧客・取引には自動登録されないことを確認する。顧客詳細では本人確認書類の検証用画像を保存・表示できることを確認する。staffでも自店だけが表示され、他店舗の原本・画像は表示できないことを確認する。
4. 「Phase4画像保存・読取・修正保存OK／staff画像制御OK」と返す。原本画像・顧客情報・秘密キーをチャットへ送る必要はない。

実サービスでエラーが出た場合は、画面のエラー文と実施した操作を返す。意図的に本番のAPIキーを壊してエラーを作らない。
読取失敗時はエラー一覧の再処理で復旧できる。画像自体が不鮮明・破損している場合は、別の原本として登録し直す。

## 運用上の制限

- サイズは10MB、画素数は4,000万画素以下。PDF・複数ページ画像は対象外。
- 画像はブラウザからStorageへ直接転送し、サーバーで実形式・完全な画像か・画素数・サイズを検証してから参照可能にする。
- 発行するアップロード用署名トークンは特定の保存先だけに有効（Supabaseの期限2時間）。原本を上書きしない。画像閲覧は毎回認証/RLSを確認するAPI経由で、公開URLや閲覧用署名URLを発行しない。
- OpenAIの待ち時間は40秒。処理が中断して2分経過した原本はエラー一覧から再処理できる。処理トークンで古い応答の上書きを防ぐ。
- 修正保存は更新日時を照合し、同時編集の上書きを拒否する。
- 画像検証に失敗したアップロードは参照可能にしない。未完了ファイルの自動削除、原本差替え・削除UI、保存期間は今回の実装対象外。削除運用は別途設計する。
- Google Drive連携、正式カテゴリ体系、カード位置・「不」の判定位置、FC変換、販売・卸は未実装。
