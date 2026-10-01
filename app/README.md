# アプリケーション

このディレクトリがNext.js / VercelのRoot Directoryです。
設定・設計・開発計画は [リポジトリREADME](../README.md) を参照してください。

```bash
# リポジトリルートから
cp .env.example app/.env.local
cd app
npm ci
npm run dev
```

`npm run check` で型・lint・認証/RLSテスト・本番buildを確認します。
実Supabase設定は [設定手順](../docs/setup-supabase.md)、公開は [Vercel手順](../docs/deploy-vercel.md)。
