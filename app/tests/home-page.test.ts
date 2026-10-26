import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { session, rpc, from } = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/business/access", () => ({
  businessSession: session,
  storeAllowed: (_: unknown, id: string) =>
    id === "00000000-0000-4000-8000-000000000010",
}));
vi.mock("@/components/home/dashboard", () => ({ HomeDashboard: () => null }));
import Home from "@/app/(portal)/page";
const store = "00000000-0000-4000-8000-000000000010";
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({
    profile: { role: "staff", store_id: store },
    stores: [{ id: store, name: "Test", is_active: true }],
    supabase: { rpc, from },
  });
  from.mockReturnValue({
    select: () => ({
      order: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  });
});
describe("HOME server boundary", () => {
  it("stops before data reads when authentication fails", async () => {
    session.mockRejectedValue(new Error("auth redirect"));
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "auth redirect",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid or unauthorized filters without querying business data", async () => {
    for (const params of [
      { store: "00000000-0000-4000-8000-000000000011" },
      { from: "bad" },
    ]) {
      const el = await Home({ searchParams: Promise.resolve(params) });
      expect(renderToStaticMarkup(el)).toContain('role="alert"');
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes only explicit bounded filters to the RLS RPC and validates results", async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        summary: {
          visits: 0,
          completed: 0,
          not_completed: 0,
          pending: 0,
          amount: 0,
          unpriced: 0,
        },
        daily: [],
        recent: [],
        items: [],
        item_count: 0,
        categories: [],
      },
    });
    await Home({
      searchParams: Promise.resolve({
        from: "2026-10-01",
        to: "2026-10-31",
        store,
        category: "uncategorized",
      }),
    });
    expect(rpc).toHaveBeenCalledWith("get_home_report", {
      p_from: "2026-10-01",
      p_to: "2026-10-31",
      p_store: store,
      p_day: null,
      p_category: null,
      p_uncategorized: true,
    });
  });
  it("does not turn errors or malformed responses into zero/demo data or leak database errors", async () => {
    for (const value of [
      { data: null, error: { message: "private SQL error" } },
      { data: { amount: 1 }, error: null },
    ]) {
      rpc.mockResolvedValue(value);
      await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "HOMEを取得できません",
      );
    }
  });
});
