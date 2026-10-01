"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { businessSession } from "@/lib/business/access";
import { reviewSchema } from "@/lib/ai/schemas";
import type { ActionState } from "@/lib/forms";
export async function saveReview(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await businessSession();
  const id = z.uuid().safeParse(form.get("id")),
    version = z.iso
      .datetime({ offset: true })
      .safeParse(form.get("updated_at"));
  let input: unknown;
  try {
    input = JSON.parse(String(form.get("review") ?? ""));
  } catch {
    return {
      message: "確認内容を読み取れません。入力内容を確認してください。",
    };
  }
  const parsed = reviewSchema.safeParse(input);
  if (!id.success || !version.success || !parsed.success)
    return {
      message:
        "確認内容を保存できません。日付・数値・文字数を確認してください。",
    };
  try {
    const { error } = await supabase.rpc("save_import_review", {
      p_id: id.data,
      p_review: parsed.data,
      p_expected_updated_at: version.data,
    });
    if (error)
      return {
        message:
          error.code === "40001"
            ? "別の操作で原本が更新されています。画面を再読み込みして確認してください。"
            : "確認内容を保存できません。原本と入力内容を確認してください。",
      };
  } catch {
    return {
      message: "確認内容を保存できません。接続状態を確認してください。",
    };
  }
  revalidatePath("/imports");
  revalidatePath(`/imports/${id.data}`);
  redirect(`/imports/${id.data}?saved=1`);
}
