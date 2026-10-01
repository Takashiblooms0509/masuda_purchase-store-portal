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
export async function saveCategory(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
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
  try {
    const { error } = id
      ? await supabase
          .from("product_categories")
          .update(values)
          .eq("id", id)
          .select("id")
          .single()
      : await supabase
          .from("product_categories")
          .insert(values)
          .select("id")
          .single();
    if (error)
      return {
        message:
          error.code === "23514"
            ? "親カテゴリに自分自身や子孫は指定できません。親子関係を確認してください。"
            : saveError(error.code),
      };
  } catch {
    return { message: "カテゴリを保存できません。" };
  }
  revalidatePath("/categories");
  revalidatePath("/purchases", "layout");
  return { message: "カテゴリを保存しました。", success: true };
}
