import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CSV_COLUMNS,
  CUSTOMER_CSV_BYTES,
  customerCsvTemplate,
  decodeCustomerCsv,
  previewCustomerCsv,
} from "@/lib/customers/csv";
const header = CUSTOMER_CSV_COLUMNS.join(",") + "\r\n";
describe("Japanese customer CSV template and preview", () => {
  it("exports only Japanese basic-field headers with BOM and CRLF, never identity or private data", () => {
    expect(customerCsvTemplate()).toBe("\ufeff" + header);
    expect(customerCsvTemplate()).not.toMatch(
      /本人確認|住所|生年月日|メモ|性別/,
    );
  });
  it("accepts template headers exactly, preserves leading zeroes, handles quoted commas/newlines/quotes", () => {
    const preview = previewCustomerCsv(
      "\ufeff" +
        header +
        '001,"架空,氏名","フリ\nガナ",000-0000-0000,"CARD""01"\r\n',
    );
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].value).toEqual({
      store_code: "001",
      name: "架空,氏名",
      name_kana: "フリ\nガナ",
      phone: "000-0000-0000",
      membership_card_number: 'CARD"01',
    });
  });
  it("rejects English, reordered, extra sensitive and duplicate headers", () => {
    for (const h of [
      "store,name,kana,phone,card",
      "氏名,登録店舗コード,フリガナ,電話番号,リピーターズカード番号",
      CUSTOMER_CSV_COLUMNS.join(",") + ",本人確認書類番号",
      "登録店舗コード,氏名,氏名,電話番号,リピーターズカード番号",
    ])
      expect(() => previewCustomerCsv(h + "\nA,架空,,,")).toThrow("列名");
  });
  it("requires data and bounds rows and bytes before processing", () => {
    expect(() => previewCustomerCsv(header)).toThrow("1〜20");
    expect(() =>
      previewCustomerCsv(header + Array(21).fill("A,架空,,,").join("\n")),
    ).toThrow("1〜20");
    expect(() => previewCustomerCsv("あ".repeat(CUSTOMER_CSV_BYTES))).toThrow(
      "32KB",
    );
    expect(() => decodeCustomerCsv(new Uint8Array())).toThrow("32KB");
  });
  it("validates UTF-8 and rejects broken CSV and NUL", () => {
    expect(() => decodeCustomerCsv(new Uint8Array([0x82, 0xa0]))).toThrow(
      "UTF-8",
    );
    expect(() => previewCustomerCsv(header + 'A,"未閉じ,,,')).toThrow("引用符");
    expect(() => previewCustomerCsv(header + 'A,"氏名"x,,,')).toThrow("引用符");
    expect(() => previewCustomerCsv(header + "A,\0,,,")).toThrow("NUL");
  });
  it("reports all invalid rows without losing line references or silently repairing data", () => {
    const p = previewCustomerCsv(
      header + ",氏名,,,\nA,,,,\nA,氏名,,\nA,正常,,,",
    );
    expect(p.errors.map((x) => x.line)).toEqual([2, 3, 4]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].line).toBe(5);
  });
  it("detects repeated rows but does not merge similar customers", () => {
    const p = previewCustomerCsv(header + "A,架空,,,\nA,架空,,,\nB,架空,,,");
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0].line).toBe(3);
    expect(p.rows).toHaveLength(3);
  });
  it.each(["=1+1", "+cmd", "-1", "@SUM(A1)", "'=1+1", "\t=1"])(
    "rejects spreadsheet formula input %s",
    (value) => {
      expect(previewCustomerCsv(header + `A,${value},,,`).errors).toHaveLength(
        1,
      );
    },
  );
});
