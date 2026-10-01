# 検証記録

## Phase1：開発環境での検証

2026-10-01、Node.js 24.19.0 / Next.js 16.3.8で実施。

| 検証 | 結果 |
|---|---|
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm test` | 2ファイル、20テスト成功 |
| `npm run build` | 本番build成功 |
| Chromiumの本番サーバー確認 | 成功 |
| `git diff --check` | 成功 |
| `.env.local`のGit除外 | 確認済み |

RLSテストでは実migrationをPGliteのPostgreSQLで実行。
匿名アクセス拒否、JWTなし、staffの他店舗・他ユーザー参照禁止、自己昇格/店舗変更禁止、
店舗更新/作成禁止、無効利用者・無効店舗、admin権限、Authメール同期、
メタデータによる権限付与の禁止、DB制約を確認した。

Chromiumでは未認証で `/` / `/admin/stores` / `/admin/users` / `/account-pending` が
ログインへ移動すること、ログイン画面の必須入力・パスワード属性、セキュリティヘッダー、
Cache-Controlのno-store、PC/モバイル幅での表示、ブラウザ例外がないことを確認した。

### 初回PR作成時の未実施項目
- 実Supabaseへのmigration適用、Auth設定、初期店舗/管理者作成
- 実アカウントを使ったログイン・ログアウトと管理画面CRUD
- Vercelデプロイと公開後の動作確認
- Phase2以降の顧客・取引・画像/AI読取（今回の実装対象外）

秘密情報を使用せず実行できる検証まで実施した。
実サービスの設定・確認は `docs/setup-supabase.md` / `docs/deploy-vercel.md` のユーザー作業に従う。


## Phase1：公開後のユーザー確認

ユーザーから以下の完了報告を受領。本番URLは
[買取店管理ポータル](https://masuda-purchase-store-portal.vercel.app)。

- Phase1 migration成功、Email認証有効・公開サインアップ無効
- 初期店舗・有効admin設定、店舗・ユーザー表示
- PR #1のmainマージ、Vercel公開、Supabase Site URL設定
- 本番adminログイン、staffログイン・権限制御

Codexが実Supabaseへ直接接続して全件検証した結果ではなく、ユーザーの画面確認結果。

## Phase2：開発環境での検証

2026-10-01、同じNode.js / Next.js構成で実施。

| 検証 | 結果 |
|---|---|
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm test` | 4ファイル、58テスト成功 |
| `npm run build` | 本番build成功 |
| Chromiumによるログイン後の操作 | 成功（ローカルAuth/REST代替環境） |
| `git diff --check` | 成功 |

実migrationをPGliteで実行し、6業務テーブルと子データの店舗RLS、匿名・inactiveの拒否、
他店舗の登録/編集拒否、親子FK、書類種別、カテゴリ循環/level、列単位権限を検証。
既存顧客の4判定条件、初回/最終来店日の再計算、取引/明細の原子的保存と失敗時rollback、
明細UUID・行順・AI原値保持、不正な明細ID、重複原本、NaN金額/数量の拒否も確認した。

ブラウザでは架空データを使い、顧客候補確認後の入力保持、明示的新規登録・編集、
書類情報・カテゴリ・原本情報の登録、取引と複数明細の保存・再編集・行除去、
残る明細UUIDの保持、顧客検索、staffの管理画面/他店舗顧客の拒否を確認した。
実Supabase Auth/RESTの代わりにローカルの代替APIを使用し、DBには実migrationを適用している。
代替API・ブラウザ用一時スクリプトはリポジトリに含めず、実顧客や本番DBは変更していない。

### Phase2の未実施

- 実Supabaseへの追加migration適用
- VercelへのPhase2反映、実アカウントでの新機能の確認

次は [phase2-setup.md](phase2-setup.md) に沿い、追加SQLを適用してからコードをmainへ反映する。
画像・AI処理、ダッシュボード集計、エラー一覧はPhase3以降の対象。


## Phase2：公開後のユーザー確認

ユーザーからPhase2 migration成功（Success. No rows returned）、PR #2マージ・デプロイ完了、
「顧客登録・編集OK／取引・明細保存OK／staff確認OK」の報告を受領。
CodexはPR #2のmerged状態と、本番/loginの200、未認証の/customers・/purchases・/categories・/importsが
/loginへ移動することを確認した。ログイン後の業務操作はユーザーの確認結果。

## Phase3：開発環境での検証

2026-10-01、同じNode.js / Next.js構成で実施。

| 検証 | 結果 |
|---|---|
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm test` | 5ファイル、70テスト成功 |
| `npm run build` | 本番build成功、/errorsを含む15ルート |
| Chromiumのログイン後操作 | 成功（ローカルAuth/REST代替環境） |
| `git diff --check` | 成功 |

Phase1〜Phase3の実SQLをPGliteで実行。日本時間の00:00/月初/月末/年越し/うるう日、
DBセッションのtimezone差、1,000件超の集計、成約のみの金額・未入力と0円の区別、
空期間、admin/staff/匿名/JWTなし/inactive/無効店舗のRLSを検証した。
既存Phase1/Phase2テストも全件成功。

Chromiumでは架空取引・原本を使い、7集計値、最近5件、未入力金額の注意表示、
取引金額編集後のダッシュボード更新、admin/staffの集計範囲を確認した。
エラー一覧はfailedのみの表示、店舗絞り込み、30件ごとのページ送り、該当原本へのリンク、
他店舗IDを指定したstaffの拒否、再処理の無効化を確認。幅620pxの表示も確認した。
ローカル代替APIを使った検証であり、実Supabaseや本番データを変更していない。

### Phase3の未実施

実Supabaseへの集計関数SQL適用、Vercel反映後の実アカウントによる集計・エラー一覧の確認。
[phase3-setup.md](phase3-setup.md)にユーザー作業を記載。
