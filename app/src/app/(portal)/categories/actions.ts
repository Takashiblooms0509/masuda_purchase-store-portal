"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  categorySchema,
  nullableString,
  nullableNumber,
} from "@/lib/business/schemas";
import { saveError } from "@/lib/business/access";
import type { ActionState } from "@/lib/forms";
import { z } from "zod";
export type CategoryState = ActionState & { updatedAt?: string };
export async function saveCategory(
  _state: ActionState,
  form: FormData,
): Promise<CategoryState> {
  const { supabase } = await requireAdmin();
  const parsed = categorySchema.safeParse({
    id: nullableString(form, "id"),
    parent_category_id: nullableString(form, "parent_category_id"),
    category_name: nullableString(form, "category_name"),
    display_order: nullableNumber(form, "display_order") ?? 0,
    is_active: form.get("is_active") === "on",
  });
  if (!parsed.success)
    return { message: "カテゴリ名・親カテゴリ・表示順を確認してください。" };
  const { id, ...values } = parsed.data;
  const revision = z.iso
    .datetime({ offset: true })
    .safeParse(form.get("updated_at"));
  if (id && !revision.success)
    return {
      message: "更新日時を確認できません。ページを再読み込みしてください。",
    };
  try {
    const { data, error } = id
      ? await supabase
          .from("product_categories")
          .update(values)
          .eq("id", id)
          .eq("updated_at", revision.data!)
          .select("updated_at")
          .maybeSingle()
      : await supabase
          .from("product_categories")
          .insert(values)
          .select("updated_at")
          .single();
    if (error)
      return {
        message:
          error.code === "23514"
            ? "親カテゴリに自分自身や子孫は指定できません。親子関係を確認してください。"
            : saveError(error.code),
      };
    if (!data)
      return {
        message:
          "他の更新がありました。入力内容を控え、ページを再読み込みして確認してください。",
      };
    revalidatePath("/categories");
    revalidatePath("/purchases", "layout");
    revalidatePath("/");
    return {
      message: "この行を保存しました。",
      success: true,
      updatedAt: data.updated_at,
    };
  } catch {
    return { message: "カテゴリを保存できません。" };
  }
}
