import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { session, from, rpc } = vi.hoisted(() => ({
  session: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/business/access", () => ({
  businessSession: session,
  storeAllowed: (s: { stores: { id: string }[] }, id: string) =>
    s.stores.some((x) => x.id === id),
}));
vi.mock("@/components/customers/detail-panel", () => ({
  CustomerDetailPanel: (p: {
    customer: { name: string };
    editForm?: unknown;
    relatedHref?: string;
  }) =>
    createElement(
      "aside",
      { "data-editable": Boolean(p.editForm), "data-related": p.relatedHref },
      p.customer.name,
    ),
}));
vi.mock("@/app/(portal)/customers/forms", () => ({ CustomerForm: () => null }));
import CustomersPage from "@/app/(portal)/customers/page";
const store = "00000000-0000-4000-8000-000000000010",
  other = "00000000-0000-4000-8000-000000000011";
const customer = {
  id: "00000000-0000-4000-8000-000000000001",
  store_id: other,
  name: "架空顧客",
  name_kana: null,
  phone: null,
  membership_card_number: null,
  created_at: "2026-10-26T01:00:00Z",
};
const report = {
  customers: [customer],
  selected: customer,
  total: 1,
  stores: [
    { id: store, name: "検証A店" },
    { id: other, name: "検証B店" },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockImplementation(async (name: string) => ({
    data:
      name === "get_customer_detail"
        ? {
            customer: {
              ...customer,
              birth_date: "1990-01-01",
              gender: "female",
              occupation: null,
              postal_code: null,
              address: "PRIVATE-APPROVED",
              dm_allowed: null,
              identification_type: null,
              identification_number: "FAKE-ID",
              memo: null,
              first_visit_date: null,
              last_visit_date: null,
              updated_at: customer.created_at,
            },
            store_name: "検証B店",
            documents: [],
            document_count: 0,
            transactions: [],
            transaction_count: 0,
          }
        : report,
    error: null,
  }));
  session.mockResolvedValue({
    profile: { id: "staff", role: "staff" },
    stores: [{ id: store, name: "検証A店", is_active: true }],
    supabase: { from, rpc },
  });
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: customer, error: null }),
      }),
    }),
  });
});
describe("Customer directory boundary", () => {
  it("authenticates before reading", async () => {
    session.mockRejectedValue(Error("auth"));
    await expect(
      CustomersPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("auth");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("invalid dates or selected IDs make no data call", async () => {
    for (const p of [
      { from: "bad" },
      { from: "0000-01-01" },
      { selected: "bad" },
    ])
      expect(
        renderToStaticMarkup(
          await CustomersPage({ searchParams: Promise.resolve(p) }),
        ),
      ).toContain('role="alert"');
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes independent conditions and cross-store filters to the directory only", async () => {
    await CustomersPage({
      searchParams: Promise.resolve({
        name: "A%",
        phone: "001",
        card: "012",
        store: other,
        from: "2026-10-01",
        to: "2026-10-31",
        selected: customer.id,
      }),
    });
    expect(rpc).toHaveBeenCalledWith("get_customer_directory_v2", {
      p_name: "A%",
      p_phone: "001",
      p_card: "012",
      p_store: other,
      p_from: "2026-10-01",
      p_to: "2026-10-31",
      p_selected: customer.id,
      p_page: 1,
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("staff cross-store URL has no full record read, editing or related-resource link", async () => {
    const html = renderToStaticMarkup(
      await CustomersPage({
        searchParams: Promise.resolve({ selected: customer.id }),
      }),
    );
    expect(html).toContain('data-editable="false"');
    expect(html).not.toContain("data-related=");
    expect(from).not.toHaveBeenCalled();
    expect(html).toContain("検証B店");
  });
  it("admin then staff requests do not share editable or sensitive state", async () => {
    const s = await session();
    session.mockResolvedValue({
      ...s,
      profile: { id: "admin", role: "admin" },
    });
    expect(
      renderToStaticMarkup(
        await CustomersPage({
          searchParams: Promise.resolve({ selected: customer.id }),
        }),
      ),
    ).toContain('data-editable="true"');
    expect(from).not.toHaveBeenCalled();
    session.mockResolvedValue(s);
    expect(
      renderToStaticMarkup(
        await CustomersPage({
          searchParams: Promise.resolve({ selected: customer.id }),
        }),
      ),
    ).toContain('data-editable="false"');
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects unexpected sensitive columns instead of sending them into client props", async () => {
    rpc.mockResolvedValue({
      data: {
        ...report,
        selected: { ...customer, identification_number: "PRIVATE" },
      },
      error: null,
    });
    const html = renderToStaticMarkup(
      await CustomersPage({
        searchParams: Promise.resolve({ selected: customer.id }),
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("PRIVATE");
    expect(html).not.toContain("<aside");
    expect(from).not.toHaveBeenCalled();
  });
  it("network and RPC errors return safe feedback without a stale panel", async () => {
    for (const mode of ["error", "throw"]) {
      if (mode === "error")
        rpc.mockResolvedValue({
          data: null,
          error: { message: "private diagnostics" },
        });
      else rpc.mockRejectedValue(Error("private diagnostics"));
      const html = renderToStaticMarkup(
        await CustomersPage({
          searchParams: Promise.resolve({ selected: customer.id }),
        }),
      );
      expect(html).toContain('role="alert"');
      expect(html).not.toContain("private diagnostics");
      expect(html).not.toContain("<aside");
    }
  });
  it("missing selected customer is explicit and retains the search URL", async () => {
    rpc.mockResolvedValue({ data: { ...report, selected: null }, error: null });
    const html = renderToStaticMarkup(
      await CustomersPage({
        searchParams: Promise.resolve({
          name: "テスト",
          selected: customer.id,
        }),
      }),
    );
    expect(html).toContain("顧客が見つからないか");
    expect(html).toContain("選択を解除");
    expect(from).not.toHaveBeenCalled();
  });
});
