# Phase2：追加migrationと動作確認

Phase1のSupabase・Auth・店舗/admin/staff設定は完了済み。本番URL：
[買取店管理ポータル](https://masuda-purchase-store-portal.vercel.app)。
Phase2では既存のstores / profilesやAuthアカウントを作り直さない。
秘密キーやOpenAI設定の追加は不要。画像・AI処理はまだ実装しない。

## 追加SQLを先に適用

【ユーザー作業】
1. [Supabase Dashboard](https://supabase.com/dashboard)でmasuda_purchase_store_portalを開く。
2. Table Editorでcustomers / customer_documents / product_categories / document_imports / purchase_transactions / purchase_itemsが既存でないことを確認する。既存の場合は実行前にCodexへ知らせる。続いてSQL Editor → New queryへ移動する。
3. [Phase2 SQLファイル](https://github.com/Takashiblooms0509/masuda_purchase-store-portal/blob/codex/phase2-business-crud/supabase/migrations/202610010002_phase2_business.sql)を開き、RawでSQLだけ表示して全体をコピーし、New queryへ貼り付けてRunを押す。成功後は再実行しない。
4. Codexへ「Phase2 migration成功」と返す。失敗した場合は個人情報を含まないエラー文だけ返す。

追加SQLは単一トランザクションで6テーブル・RLS・FK・DB関数を追加する。
既存店舗/利用者/権限は変更しない。Phase1 SQLを再実行しない。
SQL Editorで手動適用した場合、将来CLI運用に移行するときに履歴整合が必要。
今回のバージョンは202610010002（Phase1は202610010001）。

## コードの反映

【ユーザー作業】
1. GitHubでPhase2のPRを開く（CodexがPR URLを案内する）。
2. Files changedで変更を確認し、ConversationでCIが成功していることを確認する。
3. migration適用が成功した後にPRをmainへマージする。Vercelの対象プロジェクト → DeploymentsでmainのProductionデプロイがReadyになるまで待つ。コード反映前にDB追加だけを行ってもPhase1画面は利用できる。
4. Codexへ「Phase2マージ・デプロイ完了」と返す。自動デプロイが作成されない場合はCodexへ知らせる。

## 管理者の確認

【ユーザー作業】
1. 本番ポータルへ管理者でログインする。
2. 顧客管理 → 顧客を登録で氏名・電話などを入力し、既存候補を確認する。候補があれば既存顧客を選ぶか、別の新規顧客として明示的に登録する。テストには実際の個人情報を使わない。
3. 顧客詳細で編集、書類情報登録、来店取引登録を確認する。取引に商品明細を追加して保存し、再編集後も行数・金額が正しいことを確認する。カテゴリ管理で正式なカテゴリを登録する。データ取込ではファイル名・種別の管理だけを確認する。
4. Codexへ確認結果を返す。顧客名・電話・住所・本人確認番号などを貼り付ける必要はない。

テストデータは本番DBに残るため、最小限にする。実運用とは別の検証用Supabaseがある場合はそちらを優先する。
顧客・取引の物理削除は今回は許可しない。明細行の除去は取引編集で可能で、保存時に反映する。

## スタッフの確認

【ユーザー作業】
1. 同じ本番ポータルへstaffでログインする。
2. 顧客管理・買取実績・データ取込・カテゴリを開く。
3. 自店のデータだけが見えることと、カテゴリの登録/編集ボタンがないことを確認する。実際に2店舗を運用する場合は、他店舗の顧客/取引UUIDを直接開いても表示されないことも確認する。店舗管理・ユーザー管理は従来どおり利用不可。
4. Codexへ「Phase2 staff確認OK」または問題があった操作と一般的なエラーだけ返す。

## 今回の境界

- 顧客・来店取引・明細は登録/閲覧/編集。削除・店舗変更は権限外。
- 顧客の初回/最終来店日は取引から日本時間の日付で自動更新し、手入力しない。
- 商品カテゴリは空の状態で始める。正式体系をコード側で決めない。
- メンバーズカード番号はカード番号として保存。位置/認識ルールは未実装。
- 成約/不成約は人が指定。「不」の画像認識ルールは未実装。
- 書類・原本はファイル名/種別の情報まで。画像未登録のfile_url / uploaded_atはnull。
- ダッシュボードの売上/来店集計、エラーメニューはPhase3で追加。
- 実画像のアップロード/参照、AI処理/再試行はPhase4。今回の原本処理状態はpending。
- AIカテゴリ候補の判定自体はPhase5。明細には未分類/選択カテゴリと確認状態を保存できる。
