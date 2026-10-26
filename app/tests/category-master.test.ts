import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCategory } from "@/types/database";
import {
  categoryOrder,
  categoryParents,
  categoryPath,
} from "@/lib/categories/tree";
const { admin, from, query, revalidate } = vi.hoisted(() => {
  const query = {
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  return { admin: vi.fn(), from: vi.fn(), query, revalidate: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ requireAdmin: admin }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/lib/business/access", () => ({ saveError: () => "保存エラー" }));
import { saveCategory } from "@/app/(portal)/categories/actions";
const id = "00000000-0000-4000-8000-000000000001";
const stamp = "2026-10-26T04:00:00.123456+00:00";
function form(update = true) {
  const f = new FormData();
  f.set("category_name", " 金属 ");
  f.set("display_order", "2");
  f.set("is_active", "on");
  if (update) {
    f.set("id", id);
    f.set("updated_at", stamp);
  }
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  admin.mockResolvedValue({ supabase: { from } });
  from.mockReturnValue(query);
  for (const key of ["update", "insert", "eq", "select"] as const)
    query[key].mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: { updated_at: stamp },
    error: null,
  });
  query.single.mockResolvedValue({ data: { updated_at: stamp }, error: null });
});
describe("category row saves", () => {
  it("authorizes before any write", async () => {
    admin.mockRejectedValue(new Error("admin required"));
    await expect(saveCategory({ message: "" }, form())).rejects.toThrow(
      "admin required",
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("pins update to ID and original microsecond timestamp, allowlisted fields only", async () => {
    const f = form();
    f.set("category_level", "99");
    f.set("created_at", stamp);
    expect((await saveCategory({ message: "" }, f)).success).toBe(true);
    expect(query.eq.mock.calls).toEqual([
      ["id", id],
      ["updated_at", stamp],
    ]);
    expect(query.update).toHaveBeenCalledWith({
      category_name: "金属",
      parent_category_id: null,
      display_order: 2,
      is_active: true,
    });
    expect(revalidate).toHaveBeenCalledWith("/");
  });
  it("uses insert only for new rows", async () => {
    expect((await saveCategory({ message: "" }, form(false))).success).toBe(
      true,
    );
    expect(query.insert).toHaveBeenCalledOnce();
    expect(query.update).not.toHaveBeenCalled();
  });
  it("deactivation changes status without deleting or cascading", async () => {
    const f = form();
    f.delete("is_active");
    await saveCategory({ message: "" }, f);
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false }),
    );
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("rejects missing revision and invalid name/order before writes", async () => {
    for (const [key, value] of [
      ["updated_at", ""],
      ["category_name", " "],
      ["display_order", "1.5"],
      ["parent_category_id", "bad"],
    ]) {
      const f = form();
      f.set(key, value);
      expect((await saveCategory({ message: "" }, f)).success).not.toBe(true);
    }
    expect(from).not.toHaveBeenCalled();
  });
  it("stale rows produce a conflict without success or revalidation", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await saveCategory({ message: "" }, form())).message).toContain(
      "他の更新",
    );
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("reports hierarchy and network failures without raw database errors", async () => {
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "PRIVATE" },
    });
    expect((await saveCategory({ message: "" }, form())).message).toContain(
      "子孫",
    );
    query.maybeSingle.mockRejectedValue(new Error("PRIVATE"));
    expect((await saveCategory({ message: "" }, form())).message).toBe(
      "カテゴリを保存できません。",
    );
  });
});
describe("category hierarchy display", () => {
  const row = (id: string, parent: string | null): ProductCategory => ({
    id,
    parent_category_id: parent,
    category_name: id,
    category_level: 1,
    display_order: 0,
    is_active: true,
    created_at: stamp,
    updated_at: stamp,
  });
  it("keeps descendants together and excludes all descendants from parent choices", () => {
    const rows = [
      row("root", null),
      row("other", null),
      row("child", "root"),
      row("grandchild", "child"),
    ];
    expect(categoryOrder(rows).map((c) => c.id)).toEqual([
      "root",
      "child",
      "grandchild",
      "other",
    ]);
    expect(categoryParents(rows, "root").map((c) => c.id)).toEqual(["other"]);
    expect(categoryPath(rows[3], rows)).toBe("root / child / grandchild");
  });
  it("does not hide orphan rows or loop on malformed cycles", () => {
    const rows = [row("a", "b"), row("b", "a"), row("orphan", "missing")];
    expect(categoryOrder(rows)).toHaveLength(3);
    expect(categoryParents(rows, "a").map((c) => c.id)).toEqual(["orphan"]);
    expect(categoryPath(rows[0], rows)).toBe("b / a");
  });
});
