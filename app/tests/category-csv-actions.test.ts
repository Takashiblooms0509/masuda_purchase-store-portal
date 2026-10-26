import { beforeEach, describe, expect, it, vi } from "vitest";
const { admin, read, rpc } = vi.hoisted(() => ({
  admin: vi.fn(),
  read: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: admin }));
vi.mock("@/lib/categories/read", () => ({ readCategories: read }));
vi.mock("@/lib/business/access", () => ({ saveError: () => "保存エラー" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  previewCategoryImport,
  confirmCategoryImport,
} from "@/app/(portal)/categories/actions";
import { GET } from "@/app/(portal)/categories/export/route";
import { CSV_COLUMNS } from "@/lib/categories/csv";
const csv =
  CSV_COLUMNS.join(",") +
  "\n,parent,,,金属,0,true,\n,child,,parent,金,1,true,\n";
const upload = (file: File) => {
  const f = new FormData();
  f.set("file", file);
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  admin.mockResolvedValue({ supabase: { rpc } });
  read.mockResolvedValue([]);
  rpc.mockResolvedValue({ data: { added: 2, updated: 0 }, error: null });
});
describe("category CSV server boundaries", () => {
  it("requires admin for export, preview and save before reads/writes", async () => {
    admin.mockRejectedValue(new Error("admin required"));
    await expect(GET()).rejects.toThrow();
    await expect(
      previewCategoryImport({ message: "" }, new FormData()),
    ).rejects.toThrow();
    await expect(
      confirmCategoryImport({ message: "" }, new FormData()),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("previews without writing and confirms with one atomic RPC", async () => {
    const p = await previewCategoryImport(
      { message: "" },
      upload(new File([csv], "test.csv")),
    );
    expect(p.preview?.errors).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    const f = new FormData();
    f.set("confirmed", "on");
    f.set("rows", JSON.stringify(p.preview!.rows));
    expect((await confirmCategoryImport({ message: "" }, f)).success).toBe(
      true,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_category_batch", {
      p_rows: p.preview!.rows,
    });
  });
  it("rejects invalid UTF8, oversized files and malformed CSV before DB reads", async () => {
    for (const file of [
      new File([new Uint8Array([0x82, 0xa0])], "sjis.csv"),
      new File(["x".repeat(256 * 1024 + 1)], "big.csv"),
      new File(["bad"], "bad.csv"),
    ])
      expect(
        (await previewCategoryImport({ message: "" }, upload(file))).preview,
      ).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
  it("requires confirmation and validates payload independently of preview", async () => {
    const f = new FormData();
    f.set("rows", "[]");
    expect((await confirmCategoryImport({ message: "" }, f)).success).not.toBe(
      true,
    );
    f.set("confirmed", "on");
    expect((await confirmCategoryImport({ message: "" }, f)).success).not.toBe(
      true,
    );
    f.set("rows", "{}");
    expect((await confirmCategoryImport({ message: "" }, f)).success).not.toBe(
      true,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports re-preview for stale data and uncertain outcomes without automatic retry", async () => {
    const p = await previewCategoryImport(
      { message: "" },
      upload(new File([csv], "test.csv")),
    );
    const f = new FormData();
    f.set("confirmed", "on");
    f.set("rows", JSON.stringify(p.preview!.rows));
    rpc.mockResolvedValue({ error: { code: "40001", message: "PRIVATE" } });
    expect((await confirmCategoryImport({ message: "" }, f)).message).toContain(
      "競合",
    );
    rpc.mockRejectedValue(new Error("PRIVATE"));
    expect((await confirmCategoryImport({ message: "" }, f)).message).toContain(
      "再送せず",
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("exports only category allowlist with no-store and safe MIME", async () => {
    read.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000001",
        category_name: "=1",
        parent_category_id: null,
        display_order: 0,
        is_active: true,
        updated_at: "2026-10-26T00:00:00Z",
        extra: "PRIVATE",
      },
    ]);
    const r = await GET();
    const text = await r.text();
    expect(text).not.toContain("PRIVATE");
    expect(text).toContain('"\'=1"');
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});
