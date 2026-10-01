"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  businessSession,
  storeAllowed,
  saveError,
} from "@/lib/business/access";
import {
  customerSchema,
  customerInput,
  documentSchema,
  nullableString,
} from "@/lib/business/schemas";
import type { ActionState } from "@/lib/forms";
import type { Customer } from "@/types/database";
export type CustomerState = ActionState & {
  candidates?: Pick<
    Customer,
    "id" | "name" | "birth_date" | "phone" | "membership_card_number"
  >[];
  reviewKey?: string;
};
export async function saveCustomer(
  _state: CustomerState,
  form: FormData,
): Promise<CustomerState> {
  const session = await businessSession();
  const parsed = customerSchema.safeParse(customerInput(form));
  if (!parsed.success)
    return {
      message: "店舗・氏名・生年月日などの入力内容を確認してください。",
    };
  const { id, store_id, ...values } = parsed.data;
  if (!storeAllowed(session, store_id))
    return { message: "所属店舗の顧客のみ登録・編集できます。" };
  let customerId = id;
  try {
    if (!id) {
      const reviewKey = createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex");
      const { data: candidates, error } = await session.supabase.rpc(
        "find_customer_candidates",
        { p_store_id: store_id, p_customer: values },
      );
      if (error)
        return {
          message:
            "既存顧客候補を確認できません。時間をおいて再度お試しください。",
        };
      if (
        form.get("intent") !== "create" ||
        form.get("review_key") !== reviewKey
      ) {
        return {
          message: candidates?.length
            ? "既存顧客候補を確認してください。自動統合は行いません。"
            : "既存顧客候補は見つかりませんでした。入力内容を確認して新規登録してください。",
          candidates: (candidates ?? []).map(
            ({ id, name, birth_date, phone, membership_card_number }) => ({
              id,
              name,
              birth_date,
              phone,
              membership_card_number,
            }),
          ),
          reviewKey,
        };
      }
      const { data, error: save } = await session.supabase
        .from("customers")
        .insert({ store_id, ...values })
        .select("id")
        .single();
      if (save) return { message: saveError(save.code) };
      customerId = data.id;
    } else {
      const { error } = await session.supabase
        .from("customers")
        .update(values)
        .eq("id", id)
        .eq("store_id", store_id)
        .select("id")
        .single();
      if (error) return { message: saveError(error.code) };
    }
  } catch {
    return { message: "保存できません。時間をおいて再度お試しください。" };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  if (!id) redirect(`/customers/${customerId}`);
  return { message: "顧客情報を保存しました。", success: true };
}
export async function saveCustomerDocument(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await businessSession();
  const parsed = documentSchema.safeParse(
    Object.fromEntries(
      ["id", "customer_id", "document_type", "file_name"].map((key) => [
        key,
        nullableString(form, key),
      ]),
    ),
  );
  if (!parsed.success)
    return { message: "書類種別・ファイル名を確認してください。" };
  const { id, customer_id, ...values } = parsed.data;
  try {
    const { error } = id
      ? await supabase
          .from("customer_documents")
          .update(values)
          .eq("id", id)
          .eq("customer_id", customer_id)
          .select("id")
          .single()
      : await supabase
          .from("customer_documents")
          .insert({ customer_id, ...values })
          .select("id")
          .single();
    if (error) return { message: saveError(error.code) };
  } catch {
    return { message: "書類情報を保存できません。" };
  }
  revalidatePath(`/customers/${customer_id}`);
  return {
    message: "書類情報を保存しました。画像アップロードはPhase4で追加します。",
    success: true,
  };
}
