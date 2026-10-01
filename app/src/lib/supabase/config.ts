export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabaseの公開用環境変数が未設定です。");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Supabase URLにはHTTPSを設定してください。");
  }
  if (!key.startsWith("sb_publishable_")) {
    throw new Error("Supabase Publishable Keyを設定してください。");
  }
  return { url, key };
}
