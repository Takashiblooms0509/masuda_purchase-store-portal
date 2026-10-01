import { describe, it, expect } from "vitest";
import {
  transactionSchema,
  customerSchema,
  nullableNumber,
} from "@/lib/business/schemas";
import { toVisitIso, toLocalInput } from "@/lib/business/format";
const uuid = "00000000-0000-4000-8000-000000000001";
const header = {
  id: null,
  store_id: uuid,
  customer_id: uuid,
  document_number: null,
  visit_datetime: "2026-10-01T10:00:00+09:00",
  purchase_staff_name: null,
  payment_staff_name: null,
  transaction_status: "not_completed",
  visit_source: null,
  visit_source_detail: null,
  purchase_item_count: null,
  purchase_total: null,
  source_document_id: null,
  notes: null,
  items: [],
};
const line = {
  id: null,
  product_category_id: null,
  item_name: "商品",
  denomination_or_weight: null,
  quantity: null,
  purchase_amount: null,
  category_reviewed: false,
  notes: null,
};
describe("業務入力の検証", () => {
  it("不成約・明細なし・金額不明と0を区別して保存可能", () => {
    expect(transactionSchema.parse(header).purchase_total).toBeNull();
    expect(
      transactionSchema.parse({ ...header, purchase_total: 0 }).purchase_total,
    ).toBe(0);
  });
  it("負数・NaN・小数桁超過・商品名空欄を拒否", () => {
    for (const values of [
      { purchase_total: -1 },
      { purchase_total: NaN },
      { purchase_total: 1.001 },
      { items: [{ ...line, quantity: 0.0001 }] },
      { items: [{ ...line, item_name: " " }] },
    ])
      expect(
        transactionSchema.safeParse({ ...header, ...values }).success,
      ).toBe(false);
    expect(
      transactionSchema.safeParse({
        ...header,
        purchase_total: 0.3,
        items: [{ ...line, quantity: 1.125, purchase_amount: 0.3 }],
      }).success,
    ).toBe(true);
  });
  it("未確定の取引状態を勝手に追加しない", () => {
    expect(
      transactionSchema.safeParse({ ...header, transaction_status: "custody" })
        .success,
    ).toBe(false);
  });
  it("日本時間の日時入力を正しいオフセットで扱う", () => {
    expect(toVisitIso("2026-10-01T00:30")).toBe("2026-10-01T00:30:00+09:00");
    expect(toLocalInput("2026-09-30T15:30:00Z")).toBe("2026-10-01T00:30");
    expect(toVisitIso("invalid")).toBe("");
  });
  it("空の数量はnullで非数値は検証エラー", () => {
    const form = new FormData();
    form.set("quantity", "");
    expect(nullableNumber(form, "quantity")).toBeNull();
    form.set("quantity", "abc");
    expect(Number.isNaN(nullableNumber(form, "quantity"))).toBe(true);
  });
  it("顧客名必須・不正日付を拒否しDM不明を許容", () => {
    const customer = {
      id: null,
      store_id: uuid,
      name: "顧客",
      name_kana: null,
      birth_date: null,
      occupation: null,
      postal_code: null,
      address: null,
      phone: null,
      dm_allowed: null,
      membership_card_number: null,
      identification_type: null,
      identification_number: null,
    };
    expect(customerSchema.safeParse(customer).success).toBe(true);
    expect(customerSchema.safeParse({ ...customer, name: " " }).success).toBe(
      false,
    );
    expect(
      customerSchema.safeParse({ ...customer, birth_date: "2026-02-30" })
        .success,
    ).toBe(false);
  });
});
