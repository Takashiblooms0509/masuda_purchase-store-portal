import { describe, expect, it } from "vitest";
import {
  categoryCsv,
  parseCsv,
  parseCategoryCsv,
  previewCategories,
  CSV_COLUMNS,
  CSV_LIMIT,
  type CategoryBatchRow,
} from "@/lib/categories/csv";
import type { ProductCategory } from "@/types/database";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-10-26T04:00:00.123456+00:00";
const category = (name: string): ProductCategory => ({
  id: id(1),
  category_name: name,
  parent_category_id: null,
  display_order: -2,
  is_active: true,
  category_level: 1,
  updated_at: time,
  created_at: time,
});
const row = (overrides: Partial<CategoryBatchRow> = {}): CategoryBatchRow => ({
  id: null,
  new_key: "root",
  parent_id: null,
  parent_new_key: null,
  category_name: "金属",
  display_order: 0,
  is_active: true,
  updated_at: null,
  ...overrides,
});
describe("category CSV format and injection safety", () => {
  it.each([
    '金属, "金"\n検証',
    "=1+1",
    "+SUM(1,1)",
    "-2",
    "@test",
    "'quoted",
    "\t=1",
    "\r=1",
  ])("round-trips quoted/newline/formula-leading text %s", (name) => {
    const text = categoryCsv([category(name)]);
    expect(parseCategoryCsv(text)[0]).toMatchObject({
      category_name: name.trim(),
      display_order: -2,
      updated_at: time,
    });
    if (/^[=+\-@\t\r\n']/.test(name)) expect(text).toContain("\"'");
  });
  it("escapes formula prefixes behind spaces", () => {
    expect(categoryCsv([category("  =SUM(1)")])).toContain('"\'  =SUM(1)"');
    expect(
      parseCategoryCsv(categoryCsv([category("  =SUM(1)")]))[0].category_name,
    ).toBe("=SUM(1)");
  });
  it("supports UTF8 BOM, CRLF/LF, and a trailing newline", () => {
    expect(parseCsv('\ufeffa,b\r\n"x,y","a""b"\r\n')).toEqual([
      ["a", "b"],
      ["x,y", 'a"b'],
    ]);
    expect(parseCsv("a,b\nx,y")).toEqual([
      ["a", "b"],
      ["x", "y"],
    ]);
  });
  it.each(['a"b,c', '"a"x,b', '"a,b', "a,\0"])(
    "rejects malformed data %s",
    (text) => expect(() => parseCsv(text)).toThrow(),
  );
  it("rejects size, row count, wrong columns, unknown booleans and noninteger order", () => {
    expect(() => parseCsv("x".repeat(CSV_LIMIT + 1))).toThrow("256KB");
    expect(() => parseCsv("a\n".repeat(502))).toThrow("500行");
    expect(() => parseCategoryCsv("name\nx")).toThrow("列名");
    const header = CSV_COLUMNS.join(",") + "\n";
    expect(() => parseCategoryCsv(header + ",a,,,x,1,yes,")).toThrow();
    expect(() => parseCategoryCsv(header + ",a,,,x,1.5,true,")).toThrow();
    expect(() => parseCategoryCsv(header)).toThrow();
  });
});
describe("category projected graph preview", () => {
  it("supports child-before-parent new rows and includes full change preview", () => {
    const p = previewCategories(
      [
        row({ new_key: "child", parent_new_key: "root", category_name: "金" }),
        row(),
      ],
      [],
    );
    expect(p.errors).toEqual([]);
    expect(p.changes.map((c) => c.kind)).toEqual(["追加", "追加"]);
  });
  it("rejects duplicates even inactive, unknown parents, cycles and invalid active relationships", () => {
    expect(
      previewCategories(
        [row(), row({ new_key: "two", is_active: false })],
        [],
      ).errors.join(),
    ).toContain("重複");
    expect(
      previewCategories([row({ parent_new_key: "missing" })], []).errors.join(),
    ).toContain("存在");
    expect(
      previewCategories([row({ parent_new_key: "root" })], []).errors.join(),
    ).toContain("循環");
    expect(
      previewCategories(
        [
          row({ is_active: false }),
          row({
            new_key: "child",
            parent_new_key: "root",
            category_name: "金",
          }),
        ],
        [],
      ).errors.join(),
    ).toContain("有効");
  });
  it("rejects unknown IDs and microsecond conflicts; equivalent timestamp offsets match", () => {
    expect(
      previewCategories(
        [row({ id: id(2), new_key: null, updated_at: time })],
        [category("金属")],
      ).errors.join(),
    ).toContain("存在");
    expect(
      previewCategories(
        [
          row({
            id: id(1),
            new_key: null,
            updated_at: time.replace("123456", "123455"),
          }),
        ],
        [category("金属")],
      ).errors.join(),
    ).toContain("更新");
    expect(
      previewCategories(
        [
          row({
            id: id(1),
            new_key: null,
            updated_at: "2026-10-26T13:00:00.123456+09:00",
          }),
        ],
        [category("金属")],
      ).errors,
    ).toEqual([]);
  });
  it("rejects third-level proposals before writes", () => {
    const preview = previewCategories(
      [
        row(),
        row({ new_key: "child", parent_new_key: "root", category_name: "子" }),
        row({
          new_key: "grandchild",
          parent_new_key: "child",
          category_name: "孫",
        }),
      ],
      [],
    );
    expect(preview.errors.join()).toContain("3階層");
  });
  it("detects legacy inconsistencies without changing input", () => {
    const before = [category("重複"), { ...category("重複"), id: id(2) }];
    const serialized = JSON.stringify(before);
    expect(previewCategories([row()], before).errors.join()).toContain("重複");
    expect(JSON.stringify(before)).toBe(serialized);
  });
});
