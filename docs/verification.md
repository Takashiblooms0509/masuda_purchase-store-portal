# Phase1検証記録

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

## 未実施
- 実Supabaseへのmigration適用、Auth設定、初期店舗/管理者作成
- 実アカウントを使ったログイン・ログアウトと管理画面CRUD
- Vercelデプロイと公開後の動作確認
- Phase2以降の顧客・取引・画像/AI読取（今回の実装対象外）

秘密情報を使用せず実行できる検証まで実施した。
実サービスの設定・確認は `docs/setup-supabase.md` / `docs/deploy-vercel.md` のユーザー作業に従う。
