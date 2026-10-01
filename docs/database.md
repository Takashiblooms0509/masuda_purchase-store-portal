# DB設計

Phase1の実DDLは `supabase/migrations/202610010001_phase1_auth_stores.sql`。
Phase2の実DDLは `supabase/migrations/202610010002_phase2_business.sql`。
Phase3の集計関数は `supabase/migrations/202610010003_phase3_reporting.sql`。将来の卸・販売テーブルは定義しない。
全idはUUID。日時はtimestamptz、日付はdate、金額はnumeric(14,2)、数量/重量を数値化する場合はnumeric。
created_at / updated_atはnot null・now()、updated_atはDBトリガー更新。
指定のない業務値はnullを許可し、未読取・未確定を空文字や0と混同しない。

```mermaid
erDiagram
  auth_users ||--|| profiles : id
  stores ||--o{ profiles : store_id
  stores ||--o{ customers : store_id
  stores ||--o{ document_imports : store_id
  stores ||--o{ purchase_transactions : store_id
  customers ||--o{ customer_documents : customer_id
  customers ||--o{ purchase_transactions : customer_id
  document_imports o|--o| purchase_transactions : source_document_id
  purchase_transactions ||--o{ purchase_items : purchase_transaction_id
  product_categories o|--o{ product_categories : parent_category_id
  product_categories o|--o{ purchase_items : product_category_id
```

## Phase1：stores
| カラム | 型・制約 |
|---|---|
| id | uuid PK、gen_random_uuid() |
| code | text NOT NULL UNIQUE、trim済み非空・最大30文字 |
| name | text NOT NULL、trim済み非空・最大100文字 |
| is_active | boolean NOT NULL default true |
| created_at, updated_at | timestamptz NOT NULL |

物理削除はアプリに許可しない。無効化によってstaffのアクセスを停止する。

## Phase1：profiles
| カラム | 型・制約 |
|---|---|
| id | uuid PK / FK → auth.users.id、ON DELETE CASCADE |
| email | text NOT NULL、auth.users.emailと同期、アプリから編集不可 |
| name | text NOT NULL default ''、最大100文字 |
| role | text NOT NULL default staff、CHECK (admin, staff) |
| store_id | uuid nullable FK → stores.id、ON DELETE RESTRICT |
| is_active | boolean NOT NULL default false |
| created_at, updated_at | timestamptz NOT NULL |

有効staffはstore_id必須。adminはstore_idなしでも有効にできる。
Authユーザー作成時はinactiveのstaff・所属なし。role/name/storeはuser_metadataからコピーしない。
既存Authユーザーもmigrationでinactiveとして登録する。
store_idに索引。有効店舗かどうかはアクセス時に照会する。
メール変更はAuth側で行いトリガー同期。nameはポータル管理者が設定。

## Phase2：customers
| カラム | 型・制約 |
|---|---|
| id | uuid PK |
| store_id | uuid NOT NULL FK → stores.id |
| name | text NOT NULL（確認後の登録で必須） |
| name_kana, occupation, postal_code, address, phone | text nullable |
| birth_date | date nullable |
| dm_allowed | boolean nullable（不明と不可を区別） |
| membership_card_number | text nullable、来店回数ではなくカード番号 |
| identification_type, identification_number | text nullable、将来保護用アクセス層に分離可能 |
| first_visit_date, last_visit_date | date nullable、取引登録/修正時に履歴から更新 |
| created_at, updated_at | timestamptz NOT NULL |

UNIQUE(id, store_id)で同一店舗FKの参照先を用意。
カード番号の全体一意制約や自動統合は設けない（記載・採番ルール未確定）。
store_idとカード/電話/氏名/生年月日検索の索引を追加。find_customer_candidatesで電話の全角数字・記号と氏名の空白を正規化し、候補を表示する。自動統合しない。

## Phase2：customer_documents
| カラム | 型・制約 |
|---|---|
| id | uuid PK |
| customer_id | uuid NOT NULL FK → customers.id |
| document_type | text NOT NULL。drivers_license / my_number_card / passport / otherを初期許容 |
| file_name | text NOT NULL |
| file_url | text nullable、Phase4で非公開Storageのオブジェクトパスを設定（恒久公開URLにしない） |
| drive_file_id | text nullable、将来用 |
| uploaded_at | timestamptz nullable、画像アップロードが完了したときに設定 |
| created_at | timestamptz NOT NULL、書類情報登録日時 |

顧客1人に複数画像。RLSはcustomersを参照し店舗所属を確認。
本人確認書類の保管対象・保存期限を運用で確認し、不要な情報を収集しない。

## Phase2：document_imports
| カラム | 型・制約 |
|---|---|
| id | uuid PK |
| store_id | uuid NOT NULL FK → stores.id |
| document_type | text NOT NULL、purchase_document / customer_identification / membership_card / other |
| file_name | text NOT NULL |
| file_url | text nullable、画像未登録ではnull。Phase4で非公開オブジェクトパスを設定 |
| drive_file_id | text nullable |
| processing_status | text NOT NULL default pending、pending / processing / review_required / completed / failed |
| error_message | text nullable、個人情報/外部API生エラーを保存しない |
| retry_count | integer NOT NULL default 0、CHECK >= 0 |
| processed_at | timestamptz nullable |
| created_at, updated_at | timestamptz NOT NULL |
| ai_result | jsonb nullable、Phase4追加案：構造化された読取原データ |
| reviewed_result | jsonb nullable、Phase4追加案：確認中データ。確定業務レコードと別 |
| ai_schema_version | text nullable、Phase4追加案：読取構造のバージョン |

UNIQUE(id, store_id)。AI結果は人の確認前でも取込テーブルに保存できるが、顧客/取引/明細には登録しない。
処理ロック・重複確定・再試行競合をPhase4–5で実装する。

## Phase2：purchase_transactions
| カラム | 型・制約 |
|---|---|
| id | uuid PK |
| store_id | uuid NOT NULL FK → stores.id |
| customer_id | uuid NOT NULL、複合FK(customer_id, store_id) → customers(id, store_id) |
| document_number | text nullable（番号の一意性は業務確認後） |
| visit_datetime | timestamptz NOT NULL、確認時に必須 |
| purchase_staff_name, payment_staff_name | text nullable |
| transaction_status | text NOT NULL、初期CHECK completed / not_completed |
| visit_source, visit_source_detail | text nullable（FC変換ルールを埋め込まない） |
| purchase_item_count | integer nullable、CHECK >= 0 |
| purchase_total | numeric(14,2) nullable、CHECK >= 0 |
| source_document_id | uuid nullable UNIQUE、複合FK(source_document_id, store_id) → document_imports(id, store_id) |
| notes | text nullable |
| created_at, updated_at | timestamptz NOT NULL |

計算書1枚=1取引・1来店。取込原本1枚からの重複確定をUNIQUEで防ぐ。
statusはPostgreSQL enumに固定せずtext+CHECKで追加migrationにより拡張可能。
store_idとvisit_datetimeの複合索引、customer_idの索引。日次来店/成約はこのテーブルから算出。
買取金額集計はPhase3で実装。明細金額とヘッダー合計の不一致は現在の編集画面で警告する。点数は明細行数・数量から自動決定しない。
顧客と原本の他店舗紐付けを複合FKでDBレベルでも禁止する。

## Phase2：purchase_items
| カラム | 型・制約 |
|---|---|
| id | uuid PK、将来の卸/販売連携用の安定キー |
| purchase_transaction_id | uuid NOT NULL FK → purchase_transactions.id |
| product_category_id | uuid nullable FK → product_categories.id |
| raw_item_name | text nullable、AI原読取値 |
| item_name | text NOT NULL、ユーザー確定値 |
| denomination_or_weight | text nullable、グラム/額面の原記載を保持 |
| display_order | integer NOT NULL default 0、帳票の明細行順を維持 |
| quantity | numeric(12,3) nullable、CHECK >= 0 |
| purchase_amount | numeric(14,2) nullable、CHECK >= 0 |
| category_confidence | numeric(5,4) nullable、CHECK 0〜1 |
| category_reviewed | boolean NOT NULL default false |
| notes | text nullable |
| created_at, updated_at | timestamptz NOT NULL |

明細1行=1レコード。RLSは取引のstore_idを参照する。
明細の親取引は登録後に変更できない。RLSは親取引から店舗権限を検証する。
AIのカテゴリ候補・確定カテゴリの表示をPhase5で実装し、信頼度だけで自動確定しない。

## Phase2：product_categories
| カラム | 型・制約 |
|---|---|
| id | uuid PK |
| parent_category_id | uuid nullable FK → product_categories.id |
| category_name | text NOT NULL |
| category_level | integer NOT NULL、CHECK >= 1 |
| display_order | integer NOT NULL default 0 |
| is_active | boolean NOT NULL default true |
| created_at, updated_at | timestamptz NOT NULL |

共通マスタとしてadmin管理・staff参照。正式体系を勝手にseedしない。
親子構造とlevel整合性・循環禁止をPhase2のトリガー/管理処理で保証する。

## RLS・ファイルの後続設計
すべての業務表でRLSを有効化しauthenticatedだけに必要なSELECT/INSERT/UPDATE権限を付与する。
根テーブルはprivate.can_access_store(store_id)、子表は親レコード経由で同条件を検証する。
INSERT/UPDATEはWITH CHECKで他店舗への差替えを禁止。共通カテゴリの更新はadminだけ。
非公開Storageでは `<store UUID>/<import or customer UUID>/<random file name>` のパスを用い、
stores/profilesの有効状態をRLSで照会する。画面の画像参照は短時間署名URL。
取引・明細保存はログインユーザー権限のsave_purchase_transaction関数で原子的に実行する。Service Roleは使用しない。

## Phase2の権限と未実装境界
顧客・取引・原本・カテゴリ・書類情報は登録/閲覧/編集を実装。顧客や取引の物理削除と店舗変更は許可しない。
明細は取引編集で追加・修正・除去できる。残す明細のUUIDとAI原読取値・信頼度は保持し、行順のみ更新する。
カテゴリはadminが管理しstaffは参照。階層はトリガー計算、親変更の循環禁止と子孫level更新をDBで保証する。
file_url・uploaded_at・AI処理状態・retry_countなどはユーザーが手動書換えできない列として予約する。
Phase2ではファイル名/種別の管理まで。実画像、AI結果、再処理、エラーメニュー、ダッシュボード集計は後続Phase。
ai_result / reviewed_result / ai_schema_versionの3列はPhase4案であり今回のDDLには含めない。
初回/最終来店日は成約・不成約を含む取引日から日本時間で再計算する。集計の「本日」も日本時間の暦日とする。独自の営業日締め時刻は未定義。


## Phase3：集計関数とエラー一覧

追加のテーブル・PK/FK・RLS変更はない。get_dashboard_summary(p_as_of timestamptz default now())は
SQL STABLE / SECURITY INVOKERで、呼出者のpurchase_transactionsのRLSを維持する。
匿名には実行を許可せず、authenticatedだけに実行権限を付与する。
p_as_ofは日付境界検証用の基準時刻。通常の画面は引数を渡さずDBの現在時刻を使う。

返す値：aggregation_date（日本時間の日付）、today_visits / today_completed / today_not_completed、
today_purchase_total / today_unpriced、month_visits / month_completed / month_purchase_total / month_unpriced。
各件数はbigint、金額合計はnumeric。成約だけを金額対象とし、未入力金額は合計から除き件数を別に返す。
日次集計表を作らず、DB内の集計でRESTの取得行数上限による欠落を防ぐ。

エラー一覧はdocument_imports.processing_status=failedを店舗RLS下で取得する。
原本IDの直接リンクもRLSを通し、staffが他店舗IDを指定しても表示できない。
取引/顧客保存後はダッシュボードを、原本情報の編集後はエラー一覧を再検証する。
AIのエラー作成・再処理・処理状態変更はPhase4以降。
