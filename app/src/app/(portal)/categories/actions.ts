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
import {
  categoryBatchSchema,
  CSV_LIMIT,
  parseCategoryCsv,
  previewCategories,
  type CsvPreview,
} from "@/lib/categories/csv";
import { readCategories } from "@/lib/categories/read";
function categoryError(error: { code?: string; message?: string }) {
  if (error.code === "23505")
    return "同じ親の下に同じカテゴリ名は登録できません（無効カテゴリも含みます）。";
  if (error.message?.includes("category_active_child"))
    return "有効な子の親は無効にできません。子を移動または無効化してください。有効なカテゴリには有効な親を指定してください。";
  if (error.code === "40001" || error.code === "40P01")
    return "他の更新と競合しました。再読み込み・再プレビューして確認してください。";
  if (error.message?.includes("category_max_two_levels"))
    return "カテゴリは親と子の2階層までです。子を持つ親は別の親の下へ移動できません。";
  if (error.code === "23514")
    return "親カテゴリに自分自身や子孫は指定できません。親子関係を確認してください。";
  if (error.code === "22023" || error.code === "22P02")
    return "CSVのID・親参照・入力形式を確認し、再プレビューしてください。";
  return saveError(error.code);
}
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
        message: categoryError(error),
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

export type ImportPreviewState = ActionState & { preview?: CsvPreview };
export async function previewCategoryImport(
  _state: ImportPreviewState,
  form: FormData,
): Promise<ImportPreviewState> {
  const { supabase } = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > CSV_LIMIT)
    return { message: "1〜256KBのUTF-8 CSVを選択してください。" };
  let rows;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    rows = parseCategoryCsv(text);
  } catch (error) {
    return {
      message:
        error instanceof TypeError
          ? "UTF-8形式で保存してください（Shift_JISは非対応です）。"
          : error instanceof Error
            ? error.message
            : "CSVを読み込めません。",
    };
  }
  try {
    const preview = previewCategories(rows, await readCategories(supabase));
    return {
      message: preview.errors.length
        ? "エラーを修正して再プレビューしてください。保存はしていません。"
        : "変更内容を確認してから全件保存してください。まだ保存していません。",
      preview,
      success: preview.errors.length === 0,
    };
  } catch {
    return {
      message:
        "カテゴリを取得できません。時間をおいて再プレビューしてください。",
    };
  }
}
export async function confirmCategoryImport(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  if (form.get("confirmed") !== "on")
    return { message: "変更内容の確認チェックが必要です。" };
  const payload = form.get("rows");
  if (
    typeof payload !== "string" ||
    new TextEncoder().encode(payload).byteLength > 1048576
  )
    return { message: "取込データの形式・サイズを確認してください。" };
  let parsed;
  try {
    parsed = categoryBatchSchema.safeParse(JSON.parse(payload));
  } catch {
    return { message: "取込データの形式を確認してください。" };
  }
  if (!parsed.success)
    return { message: "取込データを再プレビューしてください。" };
  try {
    const { error } = await supabase.rpc("save_category_batch", {
      p_rows: parsed.data,
    });
    if (error) return { message: categoryError(error) };
  } catch {
    return {
      message:
        "保存結果を確認できません。再送せず、一覧を再読み込み・CSV再出力して確認してください。",
    };
  }
  revalidatePath("/categories");
  revalidatePath("/purchases", "layout");
  revalidatePath("/");
  return {
    message: `${parsed.data.length}行を一括保存しました。`,
    success: true,
  };
}
