import { z } from "zod";
import { parseCsv } from "@/lib/categories/csv";

// Template only: no existing customer export and no private fields in this format.
export const CUSTOMER_CSV_COLUMNS = [
  "登録店舗コード",
  "氏名",
  "フリガナ",
  "電話番号",
  "リピーターズカード番号",
] as const;
export const CUSTOMER_CSV_BYTES = 32 * 1024;
export const CUSTOMER_CSV_ROWS = 20;
const cell = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) =>
        !/^[\s\u0000-\u001f]*[=+@-]/.test(value) &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
      "数式形式・制御文字は使用できません。",
    );
export const customerCsvRowSchema = z.strictObject({
  store_code: cell(100).min(1),
  name: cell(100).min(1),
  name_kana: cell(100),
  phone: cell(50),
  membership_card_number: cell(100),
});
export type CustomerCsvRow = z.infer<typeof customerCsvRowSchema>;
export type CustomerCsvPreview = {
  rows: { line: number; value: CustomerCsvRow }[];
  errors: { line: number; message: string }[];
};
export function customerCsvTemplate(): string {
  return "\ufeff" + CUSTOMER_CSV_COLUMNS.join(",") + "\r\n";
}
export function decodeCustomerCsv(bytes: Uint8Array): string {
  if (!bytes.byteLength || bytes.byteLength > CUSTOMER_CSV_BYTES)
    throw new Error("CSVは1〜32KBにしてください。");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "UTF-8形式で保存してください。Shift_JISには対応していません。",
    );
  }
}
export function previewCustomerCsv(text: string): CustomerCsvPreview {
  if (new TextEncoder().encode(text).byteLength > CUSTOMER_CSV_BYTES)
    throw new Error("CSVは32KB以下にしてください。");
  const records = parseCsv(text);
  if (
    records[0]?.length !== CUSTOMER_CSV_COLUMNS.length ||
    records[0].some((value, i) => value !== CUSTOMER_CSV_COLUMNS[i])
  )
    throw new Error(
      "日本語の列名・順序が異なります。顧客CSVテンプレートを使用してください。",
    );
  if (records.length < 2 || records.length > CUSTOMER_CSV_ROWS + 1)
    throw new Error("データは1〜20行にしてください。");
  const rows: CustomerCsvPreview["rows"] = [],
    errors: CustomerCsvPreview["errors"] = [];
  const seen = new Map<string, number>();
  for (const [index, cells] of records.slice(1).entries()) {
    const line = index + 2;
    if (cells.length !== CUSTOMER_CSV_COLUMNS.length) {
      errors.push({ line, message: "列数が異なります。" });
      continue;
    }
    const parsed = customerCsvRowSchema.safeParse({
      store_code: cells[0],
      name: cells[1],
      name_kana: cells[2],
      phone: cells[3],
      membership_card_number: cells[4],
    });
    if (!parsed.success) {
      errors.push({
        line,
        message:
          "登録店舗コード・氏名は必須です。文字数と数式形式の値を確認してください。",
      });
      continue;
    }
    const value = parsed.data;
    // Exact repeated rows are errors; similar people remain review candidates, never merged.
    const key = JSON.stringify(
      Object.values(value).map((v) => v.normalize("NFKC")),
    );
    const previous = seen.get(key);
    if (previous)
      errors.push({
        line,
        message: `${previous}行目と同じ内容です。重複行を削除してください。`,
      });
    else seen.set(key, line);
    rows.push({ line, value });
  }
  return { rows, errors };
}
