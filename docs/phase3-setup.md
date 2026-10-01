# Phase3：ダッシュボード・エラー一覧の反映

Phase2の本番顧客登録/編集・取引/明細保存・staff制御はユーザー確認済み。
本番URL：[買取店管理ポータル](https://masuda-purchase-store-portal.vercel.app)。
環境変数や秘密キーの追加は不要。Phase1/Phase2のSQLは再実行しない。

## 設計と集計ルール

- 既存purchase_transactionsからDB内で集計する。日次・月次の集計テーブルを作らない。
- get_dashboard_summaryはSECURITY INVOKER。adminは全店舗、staffは自店のRLSをそのまま使う。
- 今日は日本時間00:00以上、翌日00:00未満。今月は日本時間の月初以上、翌月初未満。
- 来店数は対象期間の全取引数。成約/不成約はtransaction_statusで分ける。
- 買取金額はcompletedのpurchase_totalの合計。未入力の成約は件数を示し、合計に含めない。
- 金額未入力と0円を区別する。点数から金額を推測しない。
- 最近の5件は来店日時の降順、同日時はUUID順。各リンクから取引/顧客を開ける。
- エラー一覧はdocument_importsのfailedのみ。店舗フィルタ、30件ごとのページ、該当原本へのリンクを表示。
- 再処理ボタンは無効化し、画像読取の追加後に利用できることを表示。Phase3はAI/APIを呼ばない。

店舗別の営業日締め時刻は定義していない。「本日」は暦日であり、締め時刻を導入する場合は別途仕様確認する。
内部DBはFC Excelや将来の卸/販売帳票に依存させない。

## 追加SQL

【ユーザー作業】
1. [Supabase Dashboard](https://supabase.com/dashboard)でmasuda_purchase_store_portalを開く。
2. SQL Editor → New queryへ移動する。
3. [Phase3のSQL](https://github.com/Takashiblooms0509/masuda_purchase-store-portal/blob/codex/phase3-dashboard-errors/supabase/migrations/202610010003_phase3_reporting.sql)を開き、RawでSQL全文をコピーして貼り付け、Runを押す。今回は集計関数とその実行権限だけを追加し、新しいテーブルは作らない。成功後に同じSQLを再実行しない。
4. 「Phase3 migration成功」と返す。失敗した場合は個人情報を含まないエラー文だけ返す。

SQLは単一トランザクション。既存店舗・顧客・取引を変更しない。
SQL Editorで手動適用する場合、将来CLIへ移行する際は履歴整合が必要（今回202610010003）。

## PRの反映

【ユーザー作業】
1. Codexが案内するGitHubのPhase3 PRを開く。
2. Files changedで内容、ConversationでCI成功を確認する。
3. 追加SQL成功後にmainへマージする。Vercel → 対象プロジェクト → DeploymentsでmainのProductionがReadyになるまで待つ。
4. 「Phase3マージ・デプロイ完了」と返す。自動デプロイが作成されない場合はCodexへ知らせる。

## 本番確認

【ユーザー作業】
1. 本番ポータルに管理者でログインする。
2. ダッシュボードを開き、本日4項目・今月3項目・最近5件が表示されることを確認する。
3. Phase2で登録した取引の来店日時・結果・金額と集計を照合する。staffでも自店の値だけになることを確認する。エラー一覧を開き、失敗原本がなければ「読取エラーはありません。」になることを確認する。新しいテスト顧客や取引を追加する必要はない。
4. 「Phase3ダッシュボード・エラー一覧OK／staff集計OK」と返す。金額や顧客情報をチャットへ送る必要はない。

実際の画像読取は未実装のため、Phase3時点でエラー一覧が空なのは正常。
本番SQLで失敗原本を人工的に作らない。失敗データの表示・ページ送りは開発環境の架空データで検証する。
