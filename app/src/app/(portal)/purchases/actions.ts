"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  businessSession,
  storeAllowed,
  saveError,
} from "@/lib/business/access";
import {
  transactionSchema,
  nullableString,
  nullableNumber,
} from "@/lib/business/schemas";
import { toVisitIso } from "@/lib/business/format";
import type { ActionState } from "@/lib/forms";

export async function searchPurchaseCustomers(storeId: string, query: string) {
  const session = await businessSession();
  if (!z.uuid().safeParse(storeId).success || !storeAllowed(session, storeId))
    return { message: "店舗を選択してください。", customers: [] };
  const q = query.trim().slice(0, 100);
  let request = session.supabase
    .from("customers")
    .select("id,name,store_id,membership_card_number")
    .eq("store_id", storeId);
  if (q) request = request.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  try {
    const { data, error } = await request.order("name").order("id").limit(30);
    return error
      ? { message: "顧客候補を取得できません。", customers: [] }
      : {
          message:
            "最大30件を表示します。見つからない場合は氏名で絞り込んでください。",
          customers: data ?? [],
        };
  } catch {
    return { message: "顧客候補を取得できません。", customers: [] };
  }
}
export async function searchPurchaseImports(storeId: string, query: string) {
  const session = await businessSession();
  if (!z.uuid().safeParse(storeId).success || !storeAllowed(session, storeId))
    return { message: "店舗を選択してください。", documents: [] };
  let request = session.supabase
    .from("document_imports")
    .select("*")
    .eq("store_id", storeId)
    .eq("document_type", "purchase_document");
  const q = query.trim().slice(0, 100);
  if (q)
    request = request.ilike("file_name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  try {
    const { data, error } = await request
      .order("created_at", { ascending: false })
      .order("id")
      .limit(30);
    return error
      ? { message: "原本候補を取得できません。", documents: [] }
      : { message: "原本候補を最大30件表示します。", documents: data ?? [] };
  } catch {
    return { message: "原本候補を取得できません。", documents: [] };
  }
}
export async function saveTransaction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await businessSession();
  let items: unknown;
  try {
    items = JSON.parse(String(form.get("items") ?? ""));
  } catch {
    return { message: "商品明細の入力内容を確認してください。" };
  }
  const fields = [
    "id",
    "store_id",
    "customer_id",
    "document_number",
    "purchase_staff_name",
    "payment_staff_name",
    "transaction_status",
    "visit_source",
    "visit_source_detail",
    "source_document_id",
    "notes",
  ];
  const parsed = transactionSchema.safeParse({
    ...Object.fromEntries(
      fields.map((key) => [key, nullableString(form, key)]),
    ),
    visit_datetime: toVisitIso(form.get("visit_datetime")),
    purchase_item_count: nullableNumber(form, "purchase_item_count"),
    purchase_total: nullableNumber(form, "purchase_total"),
    items,
  });
  if (!parsed.success)
    return {
      message:
        "店舗・顧客・来店日時・商品明細を確認してください。金額は小数2桁、数量は小数3桁までです。",
    };
  const { id, items: lines, ...values } = parsed.data;
  if (!storeAllowed(session, values.store_id))
    return { message: "所属店舗の取引のみ登録・編集できます。" };
  let transactionId: string;
  try {
    const { data, error } = await session.supabase.rpc(
      "save_purchase_transaction",
      { p_id: id, p_transaction: values, p_items: lines },
    );
    if (error) return { message: saveError(error.code) };
    transactionId = data;
  } catch {
    return {
      message: "取引を保存できません。時間をおいて再度お試しください。",
    };
  }
  revalidatePath("/purchases");
  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath("/customers", "layout");
  revalidatePath(`/purchases/${transactionId}`);
  redirect(`/purchases/${transactionId}?saved=1`);
}
