"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { businessSession, storeAllowed } from "@/lib/business/access";
import {
  CUSTOMER_CSV_BYTES,
  customerCsvFields,
  type CustomerCsvRow,
  decodeCustomerCsv,
  previewCustomerCsv,
} from "@/lib/customers/csv-v2";
import { identificationNumberAllowed } from "@/lib/customers/identification";
import type { ActionState } from "@/lib/forms";
export type ImportCustomerRow = CustomerCsvRow & {
  line: number;
  store_id: string;
  store_name: string;
  name: string;
  name_kana: string;
  phone: string;
  membership_card_number: string;
  candidates: { id: string; name: string }[];
};
export type CustomerImportState = ActionState & {
  request?: string;
  rows?: ImportCustomerRow[];
};
export async function previewCustomerImport(
  _state: CustomerImportState,
  form: FormData,
): Promise<CustomerImportState> {
  const session = await businessSession(),
    file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > CUSTOMER_CSV_BYTES)
    return { message: "1〜32KBのUTF-8 CSVを選択してください。" };
  let preview;
  try {
    preview = previewCustomerCsv(
      decodeCustomerCsv(new Uint8Array(await file.arrayBuffer())),
    );
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "CSVを読み込めません。",
    };
  }
  if (preview.errors.length)
    return {
      message: preview.errors
        .map((e) => `${e.line}行目：${e.message}`)
        .join("\n"),
    };
  const rows: ImportCustomerRow[] = [];
  const incoming = new Map<string, number>();
  for (const row of preview.rows) {
    const matches = session.stores.filter(
      (s) =>
        s.code === row.value.store_code &&
        s.is_active &&
        storeAllowed(session, s.id),
    );
    if (matches.length !== 1)
      return {
        message: `${row.line}行目：登録店舗のコードが存在しないか、登録権限がありません。`,
      };
    // Derive staff target from current profile, never from a submitted UUID.
    const target =
      session.profile.role === "staff"
        ? session.profile.store_id
        : matches[0].id;
    if (!target || target !== matches[0].id)
      return { message: "スタッフは所属店舗にのみ新規登録できます。" };
    const duplicateKeys = [
      ["name", row.value.name.replace(/[\s　]/g, "")],
      ["card", row.value.membership_card_number.trim()],
      ["phone", row.value.phone.normalize("NFKC").replace(/[^0-9]/g, "")],
    ]
      .filter(([, value]) => value)
      .map(([kind, value]) => JSON.stringify([target, kind, value]));
    const previous = duplicateKeys
      .map((key) => incoming.get(key))
      .find((line) => line !== undefined);
    if (previous !== undefined)
      return {
        message: `${row.line}行目：${previous}行目と氏名・電話・カード番号のいずれかが一致します。同一CSV内の重複候補を整理して再プレビューしてください。`,
      };
    duplicateKeys.forEach((key) => incoming.set(key, row.line));
    const { data, error } = await session.supabase
      .rpc("find_customer_candidates", {
        p_store_id: target,
        p_customer: { ...row.value },
      })
      .select("id,name");
    if (error)
      return { message: "候補を確認できません。再プレビューしてください。" };
    rows.push({
      ...row.value,
      line: row.line,
      store_id: target,
      store_name: matches[0].name,
      candidates: (data ?? []).map((c) => ({ id: c.id, name: c.name })),
    });
  }
  return {
    message:
      "既存顧客は変更しません。重複候補は初期状態で取込対象から除外しています。",
    request: randomUUID(),
    rows,
    success: true,
  };
}
const rowSchema = customerCsvFields
  .omit({ store_code: true })
  .extend({
    store_id: z.uuid(),
    approved_duplicate_ids: z.array(z.uuid()).max(20),
  })
  .strict()
  .refine((r) =>
    identificationNumberAllowed(r.identification_type, r.identification_number),
  );
export async function confirmCustomerImport(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await businessSession();
  if (form.get("confirmed") !== "on")
    return { message: "新規追加内容の確認が必要です。" };
  const request = z.uuid().safeParse(form.get("request")),
    text = form.get("rows");
  if (
    !request.success ||
    typeof text !== "string" ||
    new TextEncoder().encode(text).byteLength > 65536
  )
    return { message: "取込データを再プレビューしてください。" };
  let rows;
  try {
    rows = z.array(rowSchema).min(1).max(20).parse(JSON.parse(text));
  } catch {
    return { message: "取込データを再プレビューしてください。" };
  }
  if (
    rows.some(
      (r) =>
        !storeAllowed(session, r.store_id) ||
        !session.stores.some((s) => s.id === r.store_id && s.is_active) ||
        (session.profile.role === "staff" &&
          r.store_id !== session.profile.store_id),
    )
  )
    return { message: "登録先店舗への権限がありません。" };
  try {
    const { data, error } = await session.supabase.rpc(
      "insert_customer_csv_v2",
      {
        p_request: request.data,
        p_rows: rows,
      },
    );
    if (error)
      return {
        message:
          error.code === "40001"
            ? "候補または他の更新が変化しました。再プレビューしてください。全件保存していません。"
            : "取込できません。店舗・入力内容を再確認してください。",
      };
    revalidatePath("/customers");
    return { message: `${data}件を新規登録しました。`, success: true };
  } catch {
    return {
      message:
        "結果を確認できません。同じ確認内容で再試行すると二重登録を防止します。確認内容を変えずに再試行してください。",
    };
  }
}
