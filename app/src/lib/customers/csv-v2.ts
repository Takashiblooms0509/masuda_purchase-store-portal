import { z } from "zod";
import {
  IDENTIFICATION_TYPES,
  identificationNumberAllowed,
} from "./identification";
import { parseCsv } from "@/lib/categories/csv";

// Insert-only 13-column format. Kept separate until the versioned RPC is ready.
// Never use this serializer for exporting stored customer information.
export const CUSTOMER_CSV_COLUMNS = [
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
] as const;
export const CUSTOMER_CSV_KEYS = [
  "store_code",
  "name",
  "name_kana",
  "birth_date",
  "gender",
  "occupation",
  "phone",
  "membership_card_number",
  "postal_code",
  "address",
  "dm_allowed",
  "identification_type",
  "identification_number",
] as const;
const genderValues: Record<string, string> = {
  "": "",
  男性: "male",
  女性: "female",
  その他: "other",
  未回答: "unspecified",
};
const dmValues: Record<string, string> = { "": "", 可: "true", 不可: "false" };
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
// Canonical payload values: all strings, with empty strings representing unknown.
// Date/boolean/gender conversion happens once, before preview and digest creation.
export const customerCsvFields = z.strictObject({
  store_code: cell(100).min(1),
  name: cell(100).min(1),
  name_kana: cell(100),
  birth_date: z.union([z.literal(""), z.iso.date()]),
  gender: z.enum(["", "male", "female", "other", "unspecified"]),
  occupation: cell(100),
  phone: cell(50),
  membership_card_number: cell(100),
  postal_code: cell(20),
  address: cell(500),
  dm_allowed: z.enum(["", "true", "false"]),
  identification_type: z.enum(["", ...IDENTIFICATION_TYPES]),
  identification_number: cell(100),
});
export const customerCsvRowSchema = customerCsvFields.refine(
  (r) =>
    identificationNumberAllowed(r.identification_type, r.identification_number),
  {
    message: "マイナンバーカードの本人確認書類番号は空欄にしてください。",
  },
);
export type CustomerCsvRow = z.infer<typeof customerCsvRowSchema>;
export type CustomerCsvPreview = {
  rows: { line: number; value: CustomerCsvRow }[];
  errors: { line: number; message: string }[];
};
export function customerCsvTemplate(): string {
  return (
    "\ufeff" +
    CUSTOMER_CSV_COLUMNS.map((value) =>
      /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value,
    ).join(",") +
    "\r\n"
  );
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
    const input = Object.fromEntries(
      CUSTOMER_CSV_KEYS.map((key, i) => [key, cells[i].trim()]),
    );
    // Unknown labels must fail, not silently become NULL or a default value.
    input.gender = Object.hasOwn(genderValues, input.gender)
      ? genderValues[input.gender]
      : "INVALID";
    input.dm_allowed = Object.hasOwn(dmValues, input.dm_allowed)
      ? dmValues[input.dm_allowed]
      : "INVALID";
    const parsed = customerCsvRowSchema.safeParse(input);
    if (!parsed.success) {
      errors.push({
        line,
        message: !identificationNumberAllowed(
          input.identification_type,
          input.identification_number,
        )
          ? "マイナンバーカードの本人確認書類番号は空欄にしてください。"
          : "登録店舗・氏名、日付・性別・DM可否・書類種類の指定形式、文字数を確認してください。数式形式は使用できません。",
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
