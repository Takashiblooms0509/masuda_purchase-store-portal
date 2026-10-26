import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CSV_COLUMNS,
  customerCsvTemplate,
  previewCustomerCsv,
} from "@/lib/customers/csv-v2";
import { identificationNumberAllowed } from "@/lib/customers/identification";
import { parseCsv } from "@/lib/categories/csv";
const encode = (cells: string[]) =>
  cells.map((v) => '"' + v.replaceAll('"', '""') + '"').join(",");
const sample = [
  "W001",
  "架空顧客",
  "カクウコキャク",
  "2000-02-29",
  "未回答",
  "テスト職業",
  "000-0000-0000",
  "000001",
  "000-0000",
  "架空住所",
  "不可",
  "運転免許証",
  "DEMO-NOT-VALID",
];
const csv = (...rows: string[][]) =>
  customerCsvTemplate() + rows.map(encode).join("\r\n");
describe("13-column Japanese customer CSV", () => {
  it("matches exact approved headers without the typo, quoting the embedded comma", () => {
    expect(CUSTOMER_CSV_COLUMNS).toEqual([
      "登録店舗",
      "氏名",
      "フリガナ",
      "生年月日",
      "性別",
      "職業",
      "電話番号",
      "メンバーズカード番号(リピーターNo,)",
      "郵便番号",
      "住所",
      "DM可否",
      "本人確認書類の種類",
      "本人確認書類番号",
    ]);
    expect(customerCsvTemplate()).toContain(
      '"メンバーズカード番号(リピーターNo,)"',
    );
    expect(parseCsv(customerCsvTemplate())[0]).toEqual(CUSTOMER_CSV_COLUMNS);
    expect(customerCsvTemplate().startsWith("\ufeff")).toBe(true);
    expect(customerCsvTemplate().endsWith("\r\n")).toBe(true);
  });
  it("maps all 13 fields without losing leading zeroes", () => {
    const result = previewCustomerCsv(csv(sample));
    expect(result.errors).toEqual([]);
    expect(result.rows[0].value).toEqual({
      store_code: "W001",
      name: "架空顧客",
      name_kana: "カクウコキャク",
      birth_date: "2000-02-29",
      gender: "unspecified",
      occupation: "テスト職業",
      phone: "000-0000-0000",
      membership_card_number: "000001",
      postal_code: "000-0000",
      address: "架空住所",
      dm_allowed: "false",
      identification_type: "運転免許証",
      identification_number: "DEMO-NOT-VALID",
    });
  });
  it("accepts empty optional fields and escaped address text", () => {
    const minimal = sample.map((v, i) => (i < 2 ? v : ""));
    minimal[9] = '架空,住所\n"建物"';
    const result = previewCustomerCsv(csv(minimal));
    expect(result.errors).toEqual([]);
    expect(result.rows[0].value.address).toBe(minimal[9]);
    expect(result.rows[0].value.dm_allowed).toBe("");
  });
  it.each([
    [3, "2025-02-29"],
    [3, "2000/02/29"],
    [4, "male"],
    [10, "true"],
    [11, "未知の種類"],
  ])("rejects invalid enum/date column %s", (index, value) => {
    const row = [...sample];
    row[Number(index)] = String(value);
    expect(previewCustomerCsv(csv(row)).errors).toHaveLength(1);
  });
  it("rejects any My Number card number without returning its content", () => {
    const row = [...sample];
    row[11] = "マイナンバーカード";
    const result = previewCustomerCsv(csv(row));
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toContain("空欄");
    expect(JSON.stringify(result)).not.toContain("DEMO-NOT-VALID");
    row[12] = "";
    expect(previewCustomerCsv(csv(row)).errors).toEqual([]);
    expect(
      identificationNumberAllowed("my_number_card", "DEMO-NOT-VALID"),
    ).toBe(false);
  });
  it("does not confuse other document numbers with national numbers by length", () => {
    const row = [...sample];
    row[12] = "000000000000";
    expect(previewCustomerCsv(csv(row)).errors).toEqual([]);
  });
  it("rejects formulas in every free-text field with no echoed private values", () => {
    for (const index of [0, 1, 2, 5, 6, 7, 8, 9, 12]) {
      const row = [...sample];
      row[index] = "=DEMO_SECRET";
      const result = previewCustomerCsv(csv(row));
      expect(result.errors).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("DEMO_SECRET");
    }
  });
  it("retains duplicate, header, row-count and byte limits", () => {
    expect(previewCustomerCsv(csv(sample, sample)).errors[0].line).toBe(3);
    expect(() => previewCustomerCsv(csv(...Array(21).fill(sample)))).toThrow(
      "1〜20",
    );
    expect(() => previewCustomerCsv("あ".repeat(33000))).toThrow("32KB");
    expect(() =>
      previewCustomerCsv(
        customerCsvTemplate().replace(
          "本人確認書類の種類",
          "本人確認書類の種類※",
        ) + encode(sample),
      ),
    ).toThrow("列名");
  });
});
