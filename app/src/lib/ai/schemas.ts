import { z } from "zod";
export const AI_SCHEMA_VERSION = "purchase-v1";
const text = (max = 500) => z.string().max(max).nullable();
const amount = z.number().finite().min(0).max(999999999999.99).nullable();
const quantity = z.number().finite().min(0).max(999999999.999).nullable();
const customer = z.strictObject({
  name: text(100),
  name_kana: text(100),
  birth_date: z.iso.date().nullable(),
  occupation: text(100),
  address: text(500),
  phone: text(50),
  dm_allowed: z.boolean().nullable(),
  membership_card_number: z.null(),
});
const transaction = z.strictObject({
  visit_datetime: z.iso.datetime({ offset: true }).nullable(),
  purchase_staff_name: text(100),
  payment_staff_name: text(100),
  visit_source: text(100),
  visit_source_detail: text(500),
  transaction_status: z.enum(["completed", "not_completed"]).nullable(),
  purchase_item_count: z.number().int().min(0).max(2147483647).nullable(),
  purchase_total: amount,
});
const readItem = z.strictObject({
  raw_item_name: text(500),
  denomination_or_weight: text(100),
  quantity,
  purchase_amount: amount,
});
export const aiReadSchema = z.strictObject({
  document_number: text(100),
  store_name: text(100),
  customer,
  transaction,
  items: z.array(readItem).max(200),
  warnings: z.array(z.string().max(300)).max(30),
});
export const reviewItemSchema = readItem.extend({
  source_line_index: z.number().int().min(0).max(199).nullable(),
  item_name: text(500),
  notes: text(1000),
});
export const reviewSchema = aiReadSchema.extend({
  customer: customer.extend({ membership_card_number: text(100) }),
  items: z.array(reviewItemSchema).max(200),
  notes: text(2000),
});
export type AiReadResult = z.infer<typeof aiReadSchema>;
export type ReviewResult = z.infer<typeof reviewSchema>;
export function initialReview(result: AiReadResult): ReviewResult {
  return {
    ...result,
    notes: null,
    items: result.items.map((item, source_line_index) => ({
      ...item,
      source_line_index,
      item_name: item.raw_item_name,
      notes: null,
    })),
  };
}
