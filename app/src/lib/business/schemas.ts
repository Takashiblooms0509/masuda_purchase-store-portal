import { z } from "zod";
const text = (max = 500) => z.string().trim().max(max).nullable();
const date = z.iso.date().nullable();
const uuid = z.uuid().nullable();
const money = z
  .number()
  .finite()
  .min(0)
  .max(999999999999.99)
  .multipleOf(0.01)
  .nullable();
export const customerSchema = z.object({
  id: uuid,
  store_id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  name_kana: text(100),
  birth_date: date,
  occupation: text(100),
  postal_code: text(20),
  address: text(500),
  phone: text(50),
  dm_allowed: z.boolean().nullable(),
  membership_card_number: text(100),
  identification_type: text(100),
  identification_number: text(100),
});
export const itemSchema = z.object({
  id: uuid,
  product_category_id: uuid,
  item_name: z.string().trim().min(1).max(500),
  denomination_or_weight: text(100),
  quantity: z
    .number()
    .finite()
    .min(0)
    .max(999999999.999)
    .multipleOf(0.001)
    .nullable(),
  purchase_amount: money,
  category_reviewed: z.boolean(),
  notes: text(1000),
});
export const transactionSchema = z.object({
  id: uuid,
  store_id: z.uuid(),
  customer_id: z.uuid(),
  document_number: text(100),
  visit_datetime: z.iso.datetime({ offset: true }),
  purchase_staff_name: text(100),
  payment_staff_name: text(100),
  transaction_status: z.enum(["completed", "not_completed"]),
  visit_source: text(100),
  visit_source_detail: text(500),
  purchase_item_count: z.number().int().min(0).max(2147483647).nullable(),
  purchase_total: money,
  source_document_id: uuid,
  notes: text(2000),
  items: z.array(itemSchema).max(200),
});
export const categorySchema = z.object({
  id: uuid,
  parent_category_id: uuid,
  category_name: z.string().trim().min(1).max(100),
  display_order: z.number().int().min(-2147483648).max(2147483647),
  is_active: z.boolean(),
});
export const importSchema = z.object({
  id: uuid,
  store_id: z.uuid(),
  file_name: z.string().trim().min(1).max(255),
  document_type: z.enum([
    "purchase_document",
    "customer_identification",
    "membership_card",
    "other",
  ]),
});
export const documentSchema = z.object({
  id: uuid,
  customer_id: z.uuid(),
  file_name: z.string().trim().min(1).max(255),
  document_type: z.enum([
    "drivers_license",
    "my_number_card",
    "passport",
    "other",
  ]),
});
export function nullableString(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function nullableNumber(form: FormData, key: string): number | null {
  const value = nullableString(form, key);
  return value === null ? null : Number(value);
}
export function customerInput(form: FormData) {
  const fields = [
    "id",
    "store_id",
    "name",
    "name_kana",
    "birth_date",
    "occupation",
    "postal_code",
    "address",
    "phone",
    "membership_card_number",
    "identification_type",
    "identification_number",
  ];
  return {
    ...Object.fromEntries(
      fields.map((key) => [key, nullableString(form, key)]),
    ),
    dm_allowed:
      form.get("dm_allowed") === "true"
        ? true
        : form.get("dm_allowed") === "false"
          ? false
          : null,
  };
}
