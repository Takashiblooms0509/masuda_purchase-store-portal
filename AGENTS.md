# 買取店管理ポータル

## 目的と技術構成
紙・Excel・Driveに分散した顧客、買取、来店、商品明細、原本、AI読取結果を一元管理する。
Next.js App Router / TypeScript / Supabase PostgreSQL・Auth・Storage / Vercel。
OpenAI APIはPhase4でサーバー側のみ使用。アプリのルートは `app/`。
今回の成果物はPhase1の認証、stores / profiles、RLS、管理基盤。

## DB設計・複数店舗
店舗データの根にstore_idを持たせ、子データはFKとRLSで店舗境界を維持する。
顧客は店舗単位。買取計算書1枚をpurchase_transactionsの1取引・1来店とする。
来店・成約集計は取引から算出し、日次集計テーブルを作らない。
purchase_items.idは将来販売・卸実績を紐づける安定したキーとする。
内部DBをFC指定Excel列構造に依存させない。変換処理を後から追加する。
正式な全体案は `docs/database.md`。Phase1以外のDDLはまだ作成しない。

## 権限設計
adminは全店舗管理、staffは所属する有効店舗のみ。
権限の根拠はDBのprofiles。user_metadataやクライアント申告のroleを信用しない。
新規Authユーザーはinactiveのstaff、store_idなしで作成し、管理者が割り当てる。
profilesの自己昇格は禁止。RLSを必須にし、画面のチェックだけに依存しない。
各Server Actionと各データ取得で認証・有効プロファイルを再確認する。

## セキュリティ
未認証の業務データアクセスを禁止。非公開画像は後続PhaseでStorage RLS・短時間署名URLを実装。
.env.local / 秘密情報 / DBパスワード / OpenAI API Keyをコミットしない。
Supabase Publishable Keyは公開用キーだが、それだけで業務データを公開しない。
Service Role/Secret KeyをNEXT_PUBLIC変数に入れない。Phase1アプリには不要。
個人情報、パスワード、トークン、DB/APIの生エラーをconsoleやエラーログに出さない。
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
RLS変更時は `app/tests/rls.test.ts` を必ず実行し、匿名・他店舗・inactive・自己昇格を確認する。
実Supabaseでの適用・動作確認が未実施ならその事実を明示する。
`app/AGENTS.md` のNext.jsバージョン固有ガイドも読む。
