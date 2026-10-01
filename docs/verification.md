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
