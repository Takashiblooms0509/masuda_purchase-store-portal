"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { storeSchema, profileSchema, type ActionState } from "@/lib/forms";

export async function saveStore(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = storeSchema.safeParse({ id: formData.get("id") || undefined,
    code: formData.get("code"), name: formData.get("name"), is_active: formData.get("is_active") === "on" });
  if (!parsed.success) return { message: "店舗コード（30文字以内）・店舗名（100文字以内）を確認してください。" };
  const { id, ...values } = parsed.data;
  try {
    const { error } = id
      ? await supabase.from("stores").update(values).eq("id", id).select("id").single()
      : await supabase.from("stores").insert(values).select("id").single();
    if (error) return { message: error.code === "23505" ? "同じ店舗コードが登録されています。" : "店舗を保存できません。権限と入力内容を確認してください。" };
  } catch { return { message: "接続できません。時間をおいて再度お試しください。" }; }
  revalidatePath("/", "layout");
  return { message: "店舗を保存しました。", success: true };
}

export async function saveProfile(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const parsed = profileSchema.safeParse({ id: formData.get("id"), name: formData.get("name"), role: formData.get("role"),
    store_id: formData.get("store_id") || null, is_active: formData.get("is_active") === "on" });
  if (!parsed.success) return { message: "氏名・権限・所属店舗を確認してください。有効なスタッフには所属店舗が必要です。" };
  const { id, ...values } = parsed.data;
  if (id === user.id && (values.role !== "admin" || !values.is_active)) {
    return { message: "自分自身の管理者権限・有効状態は変更できません。別の管理者に依頼してください。" };
  }
  try {
    if (values.is_active && values.role === "staff") {
      const { data: store, error } = await supabase.from("stores").select("is_active").eq("id", values.store_id!).single();
      if (error || !store?.is_active) return { message: "有効な店舗を選択してください。" };
    }
    const { error } = await supabase.from("profiles").update(values).eq("id", id).select("id").single();
    if (error) return { message: "利用者を保存できません。権限と入力内容を確認してください。" };
  } catch { return { message: "接続できません。時間をおいて再度お試しください。" }; }
  revalidatePath("/", "layout");
  return { message: "利用者設定を保存しました。", success: true };
}
