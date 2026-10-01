# 買取店管理ポータル

## 目的と技術構成
紙・Excel・Driveに分散した顧客、買取、来店、商品明細、原本、AI読取結果を一元管理する。
Next.js App Router / TypeScript / Supabase PostgreSQL・Auth・Storage / Vercel。
OpenAI APIはサーバー側のみ使用。アプリのルートは `app/`。
Phase1の認証基盤、Phase2の業務6テーブルと登録・閲覧・編集、Phase3の基本集計とエラー一覧、Phase4の画像保存・構造化読取・確認用JSON保存を実装。

## DB設計・複数店舗
店舗データの根にstore_idを持たせ、子データはFKとRLSで店舗境界を維持する。
顧客は店舗単位。買取計算書1枚をpurchase_transactionsの1取引・1来店とする。
来店・成約集計は取引から算出し、日次集計テーブルを作らない。
purchase_items.idは将来販売・卸実績を紐づける安定したキーとする。
内部DBをFC指定Excel列構造に依存させない。変換処理を後から追加する。
正式なDB設計は `docs/database.md`。migrationは追加ファイルにし、適用済みPhase1を変更しない。

## 権限設計
adminは全店舗管理、staffは所属する有効店舗のみ。
権限の根拠はDBのprofiles。user_metadataやクライアント申告のroleを信用しない。
新規Authユーザーはinactiveのstaff、store_idなしで作成し、管理者が割り当てる。
profilesの自己昇格は禁止。RLSを必須にし、画面のチェックだけに依存しない。
各Server Actionと各データ取得で認証・有効プロファイルを再確認する。

## セキュリティ
未認証の業務データアクセスを禁止。非公開画像はStorage RLSと認証付き画像APIで保護する。画像閲覧を公開URLにしない。
.env.local / 秘密情報 / DBパスワード / OpenAI API Keyをコミットしない。
Supabase Publishable Keyは公開用キーだが、それだけで業務データを公開しない。
Service Role/Secret KeyをNEXT_PUBLIC変数に入れない。Phase4はSUPABASE_SECRET_KEYをサーバー専用で使う。利用前にAuth/RLS確認とDBで現在のactor権限再確認を必須にする。
個人情報、パスワード、トークン、DB/APIの生エラーをconsoleやエラーログに出さない。
Next.jsのServer Function引数・検索URL・ブラウザログ転送を有効化しない。
本人確認番号は将来専用のアクセス層・暗号化へ移せるよう扱う。
本番データへの破壊的操作を避け、migrationをレビュー可能なファイルにする。

## AI読取方針
型安全なJSON Schemaによる構造化出力。人の確認前に顧客・取引・明細を確定しない。
原本と編集フォームを並べ、読取値と確定値を区別する。
既存顧客はカード番号・電話・氏名・生年月日で候補表示し、自動統合しない。
カテゴリ候補・信頼度を表示し、ユーザーが修正・確認できるようにする。

## 未確定・将来拡張
カード番号の認識位置、「不」の判定位置、正式カテゴリ、来店経路からFC帳票への変換は未確定。
入電、預かり、卸・販売、FC Excel完全出力の業務仕様を勝手に決めない。
Drive取込、Gmail、販売・卸、経営分析は今回対象外。テーブルや連携を先行実装しない。
大きな業務仕様判断はユーザーに確認する。軽微な技術判断は保守性・安全性を優先する。

## 開発・確認
`cd app && npm ci && npm run check`（型・lint・テスト・build）。
RLS変更時は `app/tests/rls.test.ts` と `app/tests/business-rls.test.ts` を実行し、匿名・他店舗・inactive・自己昇格・FK・RPC原子性を確認する。
取引と明細はsave_purchase_transaction（SECURITY INVOKER）で一括保存。明細UUIDと行順、AI原読取値を保持する。
根データの店舗変更や物理削除は許可しない。明細行の削除は取引編集として店舗RLS下で許可する。
顧客の初回・最終来店日は日本時間の取引履歴からDBトリガーで更新し、直接編集しない。
実Supabaseでの適用・動作確認が未実施ならその事実を明示する。
`app/AGENTS.md` のNext.jsバージョン固有ガイドも読む。

Phase3集計はget_dashboard_summary（SECURITY INVOKER）で既存取引を日本時間の暦日/月から算出する。
RESTの行数上限に依存するクライアント集計をしない。成約金額未入力は件数を表示し、0円と区別する。
集計・エラー一覧もRLSを通し、Service Roleを使わない。集計/RLS変更時はreporting-rls.test.tsも確認する。
Phase4の再処理は失敗または2分の処理期限超過だけ。トークンで古い応答を拒否する。
新画像は署名アップロードで直接Storageへ転送し、実画像検証後に公開先パスを確定する。10MB/4,000万画素上限、上書き不可。
本人確認書類の単独画像はOpenAIへ送らない。AIカード番号はnull、単独「不」は未判定。正式カテゴリ体系はseedしない。
ai_resultは保持し、reviewed_resultへ修正を保存する。Phase5まで顧客・取引・明細への確定登録を追加しない。
Storage/RPC/AI変更時はimage-rls.test.tsとimage-reading.test.tsを実行する。
