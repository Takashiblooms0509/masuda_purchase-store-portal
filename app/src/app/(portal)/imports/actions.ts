"use server";
import { revalidatePath } from "next/cache";
import {
  businessSession,
  storeAllowed,
  saveError,
} from "@/lib/business/access";
import { importSchema, nullableString } from "@/lib/business/schemas";
import type { ActionState } from "@/lib/forms";
export async function saveImport(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await businessSession();
  const parsed = importSchema.safeParse(
    Object.fromEntries(
      ["id", "store_id", "document_type", "file_name"].map((key) => [
        key,
        nullableString(form, key),
      ]),
    ),
  );
  if (!parsed.success)
    return { message: "店舗・ファイル名・書類種別を確認してください。" };
  const { id, store_id, ...values } = parsed.data;
  if (!storeAllowed(session, store_id))
    return { message: "所属店舗の原本情報のみ登録・編集できます。" };
  try {
    const { error } = id
      ? await session.supabase
          .from("document_imports")
          .update(values)
          .eq("id", id)
          .eq("store_id", store_id)
          .select("id")
          .single()
      : await session.supabase
          .from("document_imports")
          .insert({ store_id, ...values })
          .select("id")
          .single();
    if (error) return { message: saveError(error.code) };
  } catch {
    return { message: "原本情報を保存できません。" };
  }
  revalidatePath("/imports");
  revalidatePath("/purchases", "layout");
  return {
    message:
      "原本情報を保存しました。画像アップロード・AI処理はPhase4で追加します。",
    success: true,
  };
}
