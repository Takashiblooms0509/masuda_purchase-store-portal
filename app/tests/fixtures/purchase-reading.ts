import type { AiReadResult } from "@/lib/ai/schemas";
export const readingFixture: AiReadResult = {
  document_number: "READ-TEST",
  store_name: "検証店舗",
  customer: {
    name: "検証顧客",
    name_kana: null,
    birth_date: null,
    occupation: null,
    address: null,
    phone: null,
    dm_allowed: null,
    membership_card_number: null,
  },
  transaction: {
    visit_datetime: "2026-10-01T10:00:00+09:00",
    purchase_staff_name: null,
    payment_staff_name: null,
    visit_source: null,
    visit_source_detail: null,
    transaction_status: null,
    purchase_item_count: 1,
    purchase_total: 100,
  },
  items: [
    {
      raw_item_name: "原記載の商品",
      denomination_or_weight: null,
      quantity: 1,
      purchase_amount: 100,
    },
  ],
  warnings: ["成約状態を確認してください。"],
};
