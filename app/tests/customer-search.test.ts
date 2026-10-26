import { describe, it, expect } from "vitest";
import {
  parseCustomerSearch,
  customerSearchHref,
} from "@/lib/customers/search";
describe("Customer search", () => {
  it("combines independent filters and trims text", () => {
    const { result } = parseCustomerSearch({
      name: " テスト ",
      phone: "03",
      card: "001",
      from: "2026-10-01",
      to: "2026-10-26",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({
        name: "テスト",
        phone: "03",
        card: "001",
      });
  });
  it("retains legacy keyword URLs without applying them to new searches", () => {
    expect(parseCustomerSearch({ q: "123", field: "phone" }).value.phone).toBe(
      "123",
    );
    expect(parseCustomerSearch({ q: "old", name: "" }).value.name).toBe("");
  });
  it("rejects invalid dates, inverse intervals and non-UUID selections", () => {
    for (const p of [
      { from: "0000-01-01" },
      { to: "10000-01-01" },
      { from: "2026-02-30" },
      { from: "2026-11-01", to: "2026-10-01" },
      { selected: "bad" },
      { store: "bad" },
      { name: "x".repeat(101) },
    ])
      expect(parseCustomerSearch(p).result.success).toBe(false);
  });
  it("closing a panel preserves filters and pagination", () => {
    const value = parseCustomerSearch({
      name: "テスト",
      phone: "001",
      page: "2",
      selected: "00000000-0000-4000-8000-000000000001",
    }).value;
    const url = new URL(
      customerSearchHref(value, { selected: "" }),
      "https://example.test",
    );
    expect(url.searchParams.get("name")).toBe("テスト");
    expect(url.searchParams.get("phone")).toBe("001");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("selected")).toBe(false);
  });
});
