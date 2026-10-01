import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUsePortal } from "./rules";

export async function getSession() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error("利用者情報を取得できません。管理者にDBの設定を確認してください。");
  const { data: store, error: storeError } = profile?.store_id
    ? await supabase.from("stores").select("*").eq("id", profile.store_id).maybeSingle()
    : { data: null, error: null };
  if (storeError) throw new Error("店舗情報を取得できません。時間をおいて再度お試しください。");
  return { supabase, user, profile, store, allowed: canUsePortal(profile, store) };
}

export async function requireProfile() {
  const session = await getSession();
  if (!session.allowed || !session.profile) redirect("/account-pending");
  return { ...session, profile: session.profile };
}

export async function requireAdmin() {
  const session = await requireProfile();
  if (session.profile.role !== "admin") redirect("/");
  return session;
}
