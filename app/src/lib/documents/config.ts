import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";
export { SOURCE_BUCKET } from "./limits";
export function uploadConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_"));
}
export function readingConfigured() {
  return (
    uploadConfigured() &&
    Boolean(
      process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim(),
    )
  );
}
export function privilegedClient() {
  if (!uploadConfigured()) throw new Error("画像保存の接続設定が未完了です。");
  const { url } = getSupabaseConfig();
  return createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(10000),
        }),
    },
  });
}
export function openAiConfig() {
  if (!readingConfigured()) throw new Error("画像読取の接続設定が未完了です。");
  return {
    key: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL!.trim(),
  };
}
