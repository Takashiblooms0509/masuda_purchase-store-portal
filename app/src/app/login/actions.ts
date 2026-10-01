"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type ActionState } from "@/lib/forms";

export async function login(_state: ActionState, formData: FormData): Promise<ActionState> {
  const values = loginSchema.safeParse({ email: String(formData.get("email") ?? "").trim(), password: formData.get("password") });
  if (!values.success) return { message: "メールアドレスとパスワードを入力してください。" };
  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword(values.data);
    if (error) return { message: "ログインできません。入力内容を確認するか、時間をおいてお試しください。" };
  } catch {
    return { message: "認証サービスに接続できません。時間をおいて再度お試しください。" };
  }
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("ログアウトできません。時間をおいて再度お試しください。");
  redirect("/login");
}
