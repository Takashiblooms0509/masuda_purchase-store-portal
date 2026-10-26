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
