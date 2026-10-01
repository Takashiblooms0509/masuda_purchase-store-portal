import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canUsePortal } from "@/lib/auth/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
export const documentKind = z.enum(["import", "customer_document"]);
export type DocumentKind = z.infer<typeof documentKind>;
export async function apiSession() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const profileResult = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (profileResult.error || !profileResult.data) return null;
  const profile = profileResult.data;
  const storeResult = profile.store_id
    ? await supabase
        .from("stores")
        .select("*")
        .eq("id", profile.store_id)
        .maybeSingle()
    : { data: null, error: null };
  if (storeResult.error || !canUsePortal(profile, storeResult.data))
    return null;
  return { supabase, user, profile };
}
export async function sourceDocument(
  supabase: SupabaseClient<Database>,
  kind: DocumentKind,
  id: string,
) {
  const result =
    kind === "import"
      ? await supabase
          .from("document_imports")
          .select(
            "id,file_url,upload_path,content_type,expected_file_size,file_size",
          )
          .eq("id", id)
          .maybeSingle()
      : await supabase
          .from("customer_documents")
          .select(
            "id,file_url,upload_path,content_type,expected_file_size,file_size",
          )
          .eq("id", id)
          .maybeSingle();
  return result.error ? null : result.data;
}
