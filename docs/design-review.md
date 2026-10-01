# Phase1設計レビュー

## 1. 現状とシステム構成
確認時のmainは `0b0b0b3`。`app/`にNext.js 16.3.8 / React 19.2.8 / TypeScriptの初期構成がある。
認証、DB、業務機能、migration、lockfileは未実装。初期構成を活用する。

ブラウザ → Next.js（Vercel、Server Components / Server Actions）→ Supabase Auth / PostgreSQL。
すべての業務DBアクセスはログインユーザーのJWT + Publishable Keyで行う。
RLSが最終的な店舗境界を保証する。Phase1にSecret/Service Role Keyは必要ない。
後続Phaseで非公開Supabase Storage、サーバーからのOpenAI API呼出しを追加する。

## 2–4. ER図・正式テーブル案・PK/FK
全体のテーブル・全カラム・PK/FKは [database.md](database.md) を参照。
Phase1で作成するのはstores / profilesだけ。残りは正式な実装案として記載する。
初期は1ユーザー1所属店舗、adminは全店舗。複数店舗所属が必要になった場合は所属中間テーブルへ拡張する。

## 5. RLS設計
| 対象 | admin（有効） | staff（有効） | 匿名・無効 |
|---|---|---|---|
| stores | 全件閲覧・作成・編集 | 所属する有効店舗の閲覧 | 不可 |
| profiles | 全件閲覧・権限/所属/有効状態の編集 | 自分の閲覧のみ | 匿名不可。認証済み無効ユーザーは自分の状態のみ閲覧 |
| 業務テーブル（Phase2） | 全店舗の閲覧・登録・編集 | 所属する有効店舗のみ | 不可 |
| カテゴリ（Phase2案） | 共通マスタの管理 | 有効店舗のstaffは参照 | 不可 |

削除は現仕様で業務上の要件がないため、UI・authenticatedの権限には含めない。
profilesの作成はAuthトリガーのみ。新規ユーザーは無効staffで所属なし。
roleをユーザーメタデータから取得しない。staffは自分のprofileも更新できない。
privateスキーマのSECURITY DEFINER関数でRLS再帰を避け、空search_path・限定EXECUTE権限で保護する。
メールアドレスはAuthを正とし、同期トリガーで更新する。店舗無効化はstaffの業務アクセスを停止する。

## 6. ディレクトリ
```text
/
├── AGENTS.md / README.md / .env.example
├── docs/                    設計・Supabase・Vercel手順
├── supabase/migrations/     Phase1 DDL・RLS
└── app/                     VercelのRoot Directory
    ├── src/app/login/       ログイン
    ├── src/app/(portal)/    保護された業務画面、admin管理
    ├── src/lib/auth/        認証・権限確認
    ├── src/lib/supabase/    SSRクライアント、Cookie更新
    ├── src/types/           DB型
    ├── src/proxy.ts         セッション更新
    └── tests/               認証ルール・実SQL/RLSテスト
```

## 7. 開発ステップ
1. Phase1：認証・接続、stores / profiles、RLS、管理基盤、手順・テスト（今回）。
2. Phase2：顧客・書類・カテゴリ・取引・明細・取込、FK整合性、店舗別CRUD。
3. Phase3：取引からの日次/月次集計、顧客・買取一覧/詳細、カテゴリ、エラー。
4. Phase4：非公開画像取込、OpenAI構造化読取、原本比較・修正UI。
5. Phase5：顧客候補・カテゴリ候補、確認後の原子的DB登録、再処理。
6. Phase6：総合検証、Vercel本番公開。Phase1でも型・RLS・buildを検証する。

## 8–11. 環境変数・外部サービス設定
| 環境変数 | 設定場所 | Phase1 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | app/.env.local / Vercel | 提供済み値を使用 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 同上 | 提供済み公開キーを使用 |
| OPENAI_API_KEY | 同上、サーバー専用 | 不要。Phase4まで空欄 |
| OPENAI_MODEL | 同上 | Phase4で画像・構造化出力対応モデルを選定 |

Supabase：migrationをSQL Editorで適用、Email Auth、公開サインアップ無効、初期店舗・初期admin作成。
OpenAI：Phase4でAPIプロジェクト作成、予算/使用量通知、API Keyをサーバー環境変数へ設定。
Vercel：GitHubリポジトリをImportしRoot Directoryをapp、Next.jsを選択、公開用2変数を設定。
詳細な初心者向け操作は [setup-supabase.md](setup-supabase.md) / [deploy-vercel.md](deploy-vercel.md)。

## 12. 現仕様で実装可能
Phase1の認証・店舗/プロファイル・店舗別アクセス制御は仕様から実装可能。
後続Phaseの顧客、取引、明細、手動アップロード、構造化読取、人の修正・確定、候補表示、基本集計も実装可能。
今回のダッシュボードは認証・権限状態の基盤表示のみ。未実装集計を架空の数値で表示しない。

## 13. 保留機能
未確定のカード位置・「不」判定・正式カテゴリ・FC変換を固定しない。
Drive/Gmail/販売卸/粗利/入金/入電/預かり/高度分析/完全Excel出力は実装しない。
管理者によるAuthユーザー発行はPhase1ではSupabase Dashboardで行う。
ポータルでは発行済みユーザーの所属・権限・有効状態を管理する。完全な招待/再発行UIは後続検討。

## 14. 懸念・対策
- 実Supabaseの既存テーブル・Auth設定は管理権限がないため未確認。SQLは既存名と競合した場合に停止する。実行前に対象を確認する。
- 初期adminはSQL Editorからのみ設定。最後のadminを無効化しない運用を明記する。
- 買取画像には個人情報がある。Phase4前にOpenAIへの送信に関する運用・保存期間・本人確認書類の取り扱いを確認する。
- 日次集計は店舗営業日境界が未指定。Phase3でタイムゾーン（通常Asia/Tokyo）と締め時刻を確認する。
- 人の確認とDB確定はPhase5で単一トランザクションにし、重複登録を防ぐ。
- profilesの権限変更はDBの現時点の値で確認する。JWTの古いroleへ依存しない。
- 本人確認番号は将来保護専用層へ分離する。Phase1ではまだ保存しない。

設計判断：上記はPhase1開始を妨げない。未確定業務機能は保留し、認証・RLS基盤の実装を進める。
