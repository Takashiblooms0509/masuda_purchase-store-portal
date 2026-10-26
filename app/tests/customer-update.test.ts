import { describe, it, expect, vi } from "vitest";
const { session, from } = vi.hoisted(() => ({
  session: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/business/access", () => ({
  businessSession: session,
  storeAllowed: () => true,
  saveError: () => "error",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { saveCustomer } from "@/app/(portal)/customers/actions";
describe("Customer update server authorization", () => {
  it("rejects staff even with valid form and own-store IDs before writes", async () => {
    session.mockResolvedValue({
      profile: { role: "staff" },
      supabase: { from },
    });
    const form = new FormData();
    form.set("id", "00000000-0000-4000-8000-000000000001");
    form.set("store_id", "00000000-0000-4000-8000-000000000010");
    form.set("name", "検証顧客");
    const result = await saveCustomer({ message: "" }, form);
    expect(result.message).toContain("管理者のみ");
    expect(from).not.toHaveBeenCalled();
  });
});

it("preserves hidden legacy My Number values on unrelated admin edits without reading them", async () => {
  from.mockClear();
  const update = vi.fn();
  const read = {
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({
        data: { identification_type: "マイナンバーカード" },
        error: null,
      }),
  };
  const write = {
    eq: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "saved" }, error: null }),
  };
  update.mockReturnValue(write);
  const select = vi.fn().mockReturnValue(read);
  from.mockReturnValue({ select, update });
  session.mockResolvedValue({ profile: { role: "admin" }, supabase: { from } });
  const form = new FormData();
  form.set("id", "00000000-0000-4000-8000-000000000001");
  form.set("store_id", "00000000-0000-4000-8000-000000000010");
  form.set("name", "架空顧客");
  form.set("identification_type", "マイナンバーカード");
  const result = await saveCustomer({ message: "" }, form);
  expect(result.success).toBe(true);
  expect(select).toHaveBeenCalledWith("identification_type");
  expect(update.mock.calls[0][0]).not.toHaveProperty("identification_number");
  expect(write.filter).toHaveBeenCalledWith(
    "identification_type",
    "eq",
    "マイナンバーカード",
  );
  form.set("identification_type", "その他");
  update.mockClear();
  expect((await saveCustomer({ message: "" }, form)).message).toContain(
    "個別確認",
  );
  expect(update).not.toHaveBeenCalled();
});
it("rejects direct-form My Number number before any database call", async () => {
  from.mockClear();
  session.mockResolvedValue({ profile: { role: "admin" }, supabase: { from } });
  const form = new FormData();
  form.set("store_id", "00000000-0000-4000-8000-000000000010");
  form.set("name", "架空");
  form.set("identification_type", "マイナンバーカード");
  form.set("identification_number", "DEMO-NOT-VALID");
  const result = await saveCustomer({ message: "" }, form);
  expect(result.success).not.toBe(true);
  expect(from).not.toHaveBeenCalled();
  expect(result.message).not.toContain("DEMO-NOT-VALID");
});
