import { z } from "zod";
const nullable = z.string().nullable();
export const genderLabels = {
  female: "女性",
  male: "男性",
  other: "その他",
  unspecified: "未回答",
};
export const customerDetailSchema = z.strictObject({
  customer: z.strictObject({
    id: z.uuid(),
    store_id: z.uuid(),
    name: z.string(),
    name_kana: nullable,
    birth_date: nullable,
    gender: z.enum(["female", "male", "other", "unspecified"]).nullable(),
    occupation: nullable,
    postal_code: nullable,
    address: nullable,
    phone: nullable,
    dm_allowed: z.boolean().nullable(),
    membership_card_number: nullable,
    identification_type: nullable,
    identification_number: nullable,
    memo: nullable,
    first_visit_date: nullable,
    last_visit_date: nullable,
    created_at: z.string(),
    updated_at: z.string(),
  }),
  store_name: z.string(),
  documents: z
    .array(
      z.strictObject({
        id: z.uuid(),
        document_type: z.string(),
        file_name: z.string(),
        created_at: z.string(),
        has_image: z.boolean(),
      }),
    )
    .max(20),
  document_count: z.number().int().nonnegative(),
  transactions: z
    .array(
      z.strictObject({
        id: z.uuid(),
        visit_datetime: z.string(),
        transaction_status: z.string(),
        notes: nullable,
        purchase_amount: z.number(),
        completed_items: z.number(),
        not_completed_items: z.number(),
      }),
    )
    .max(10),
  transaction_count: z.number().int().nonnegative(),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export function customerAge(birth: string | null, today: string) {
  if (!birth || birth > today) return null;
  const [year, month, day] = birth.split("-").map(Number),
    [y, m, d] = today.split("-").map(Number);
  return y - year - (m < month || (m === month && d < day) ? 1 : 0);
}
