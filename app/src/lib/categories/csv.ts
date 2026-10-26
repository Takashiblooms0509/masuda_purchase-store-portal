import { z } from "zod";
import type { ProductCategory } from "@/types/database";
export const CSV_LIMIT = 256 * 1024;
export const CSV_ROWS = 500;
export const CSV_COLUMNS = [
  "id",
  "new_key",
  "parent_id",
  "parent_new_key",
  "category_name",
  "display_order",
  "is_active",
  "updated_at",
] as const;
const key = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .nullable();
export const categoryBatchRow = z
  .strictObject({
    id: z.uuid().nullable(),
    new_key: key,
    parent_id: z.uuid().nullable(),
    parent_new_key: key,
    category_name: z.string().trim().min(1).max(100),
    display_order: z.number().int().min(-2147483648).max(2147483647),
    is_active: z.boolean(),
    updated_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine((r) =>
    r.id
      ? r.new_key === null && r.updated_at !== null
      : r.new_key !== null && r.updated_at === null,
  )
  .refine((r) => !(r.parent_id && r.parent_new_key));
export const categoryBatchSchema = z
  .array(categoryBatchRow)
  .min(1)
  .max(CSV_ROWS);
export type CategoryBatchRow = z.infer<typeof categoryBatchRow>;
export type CsvPreview = {
  rows: CategoryBatchRow[];
  errors: string[];
  changes: {
    line: number;
    kind: "追加" | "更新";
    before: string;
    after: string;
  }[];
};
const dangerous = /^(?:\s*[=+\-@]|[\t\r\n'])/;
function encodeCell(value: string) {
  const safe = dangerous.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function decodeCell(value: string) {
  return value.startsWith("'") && dangerous.test(value.slice(1))
    ? value.slice(1)
    : value;
}
export function categoryCsv(categories: ProductCategory[]) {
  return (
    "\ufeff" +
    [
      CSV_COLUMNS.join(","),
      ...categories.map((c) =>
        [
          c.id,
          "",
          c.parent_category_id ?? "",
          "",
          c.category_name,
          String(c.display_order),
          String(c.is_active),
          c.updated_at,
        ]
          .map(encodeCell)
          .join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
// Strict RFC4180-style parser: quoted commas/newlines and doubled quotes, CRLF/LF.
export function parseCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).byteLength > CSV_LIMIT)
    throw new Error("CSVは256KB以下にしてください。");
  text = text.replace(/^\ufeff/, "");
  if (text.includes("\0")) throw new Error("NUL文字は使用できません。");
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    start = true;
  const cell = () => {
    record.push(decodeCell(field));
    field = "";
    closed = false;
    start = true;
  };
  const line = () => {
    cell();
    records.push(record);
    record = [];
    if (records.length > CSV_ROWS + 1)
      throw new Error("CSVは500行以下にしてください。");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === ",") {
      cell();
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line();
      continue;
    }
    if (closed) throw new Error("閉じ引用符の後は区切り文字か改行が必要です。");
    if (c === '"') {
      if (!start) throw new Error("引用符の位置が不正です。");
      quoted = true;
      start = false;
      continue;
    }
    field += c;
    start = false;
  }
  if (quoted) throw new Error("引用符が閉じていません。");
  if (!start || closed || record.length) line();
  return records;
}
export function parseCategoryCsv(text: string): CategoryBatchRow[] {
  const records = parseCsv(text);
  if (records[0]?.join(",") !== CSV_COLUMNS.join(","))
    throw new Error(
      "列名・順序が異なります。出力CSVまたはテンプレートを使用してください。",
    );
  const rows = records.slice(1).map((cells, i) => {
    if (cells.length !== CSV_COLUMNS.length)
      throw new Error(`${i + 2}行目：列数が異なります。`);
    const raw = Object.fromEntries(CSV_COLUMNS.map((c, n) => [c, cells[n]]));
    if (
      !/^-?\d+$/.test(raw.display_order) ||
      !["true", "false"].includes(raw.is_active)
    )
      throw new Error(
        `${i + 2}行目：表示順は整数、状態はtrue/falseにしてください。`,
      );
    const row = categoryBatchRow.safeParse({
      ...raw,
      id: raw.id || null,
      new_key: raw.new_key || null,
      parent_id: raw.parent_id || null,
      parent_new_key: raw.parent_new_key || null,
      updated_at: raw.updated_at || null,
      display_order: Number(raw.display_order),
      is_active: raw.is_active === "true",
    });
    if (!row.success)
      throw new Error(
        `${i + 2}行目：ID・新規キー・親参照・名称・更新日時を確認してください。`,
      );
    return row.data;
  });
  const result = categoryBatchSchema.safeParse(rows);
  if (!result.success)
    throw new Error("CSVは1〜500行のデータを含めてください。");
  return result.data;
}
function stamp(value: string) {
  // Preserve PostgreSQL microseconds when comparing equivalent UTC timestamp representations.
  const fraction = value.match(/\.(\d+)/)?.[1] ?? "";
  return `${Math.floor(Date.parse(value) / 1000)}:${fraction.padEnd(6, "0").slice(0, 6)}`;
}
export function previewCategories(
  rows: CategoryBatchRow[],
  categories: ProductCategory[],
): CsvPreview {
  const errors: string[] = [],
    changes: CsvPreview["changes"] = [];
  type Node = {
    name: string;
    parent: string | null;
    active: boolean;
    order: number;
  };
  const graph = new Map<string, Node>(
    categories.map((c) => [
      c.id,
      {
        name: c.category_name,
        parent: c.parent_category_id,
        active: c.is_active,
        order: c.display_order,
      },
    ]),
  );
  const original = new Map(graph);
  const seen = new Set<string>();
  const describe = (n: Node, source: Map<string, Node>) =>
    `${n.name} / 親: ${n.parent ? (source.get(n.parent)?.name ?? n.parent) : "なし"} / 順: ${n.order} / ${n.active ? "有効" : "無効"}`;
  rows.forEach((r, i) => {
    const id = r.id ?? "new:" + r.new_key,
      line = i + 2;
    if (seen.has(id))
      errors.push(`${line}行目：IDまたは新規キーが重複しています。`);
    seen.add(id);
    const old = r.id ? categories.find((c) => c.id === r.id) : null;
    if (r.id && !old) errors.push(`${line}行目：更新対象IDが存在しません。`);
    if (old && stamp(old.updated_at) !== stamp(r.updated_at!))
      errors.push(`${line}行目：他の更新があります。CSVを再出力してください。`);
    const next = {
      name: r.category_name.trim(),
      parent:
        r.parent_id ?? (r.parent_new_key ? "new:" + r.parent_new_key : null),
      active: r.is_active,
      order: r.display_order,
    };
    graph.set(id, next);
  });
  rows.forEach((r, i) => {
    const id = r.id ?? "new:" + r.new_key;
    changes.push({
      line: i + 2,
      kind: r.id ? "更新" : "追加",
      before: original.has(id) ? describe(original.get(id)!, original) : "—",
      after: describe(graph.get(id)!, graph),
    });
  });
  const siblings = new Set<string>();
  for (const [id, n] of graph) {
    const sibling = JSON.stringify([n.parent, n.name.trim()]);
    if (siblings.has(sibling))
      errors.push(`同じ親の下に「${n.name}」が重複しています。`);
    siblings.add(sibling);
    if (n.parent && !graph.has(n.parent))
      errors.push(`「${n.name}」の親参照が存在しません。`);
    if (n.parent && graph.get(n.parent)?.parent)
      errors.push(`「${n.name}」は3階層以上になります。親カテゴリと子カテゴリの2階層にしてください。`);
    if (n.active && n.parent && graph.get(n.parent)?.active === false)
      errors.push(`「${n.name}」が有効なため親を無効にはできません。`);
    const path = new Set([id]);
    let parent = n.parent;
    while (parent) {
      if (path.has(parent)) {
        errors.push(`「${n.name}」の親子関係が循環します。`);
        break;
      }
      path.add(parent);
      parent = graph.get(parent)?.parent ?? null;
    }
  }
  return { rows, changes, errors: [...new Set(errors)].slice(0, 100) };
}
