import { describe, it, expect } from "vitest";
import {
  currentMonth,
  parseHomeFilters,
  conversionRate,
  homeHref,
} from "@/lib/home/report";
import { itemSchema } from "@/lib/business/schemas";
describe("HOME filter contract", () => {
  it("uses JST month across UTC boundary and leap year", () => {
    expect(currentMonth(new Date("2024-01-31T15:00:00Z"))).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });
  it("mixed 1+1 is 50%; pending-only has no denominator", () => {
    expect(conversionRate(1, 1)).toBe("50.0%");
    expect(conversionRate(0, 0)).toBe("—");
    expect(conversionRate(0, 2)).toBe("0.0%");
  });
  it("rejects invalid dates, repeated params, unknown scope and excessive ranges", () => {
    for (const p of [
      { from: "2026-02-30" },
      { from: ["2026-10-01"] },
      { store: "other" },
      { category: "<script>" },
      { from: "2026-10-02", to: "2026-10-01" },
      { from: "2020-01-01", to: "2026-10-31" },
      { day: "2020-01-01" },
    ])
      expect(
        parseHomeFilters(p, new Date("2026-10-26T00:00:00Z")).success,
      ).toBe(false);
  });
  it("preserves common filters for drilldown and clears day independently", () => {
    const f = parseHomeFilters(
      { category: "uncategorized" },
      new Date("2026-10-26T00:00:00Z"),
    );
    if (!f.success) throw Error("fixture");
    expect(homeHref(f.data, "2026-10-01")).toContain(
      "category=uncategorized&day=2026-10-01",
    );
    expect(homeHref(f.data)).not.toContain("&day=");
  });
  it("validates only explicit outcomes without inferring from amount", () => {
    const line = {
      id: null,
      product_category_id: null,
      item_name: "test",
      denomination_or_weight: null,
      quantity: null,
      purchase_amount: 123,
      category_reviewed: false,
      notes: null,
    };
    expect(itemSchema.parse(line).purchase_status).toBeUndefined();
    for (const purchase_status of ["pending", "completed", "not_completed"])
      expect(
        itemSchema.parse({ ...line, purchase_status }).purchase_status,
      ).toBe(purchase_status);
    expect(
      itemSchema.safeParse({ ...line, purchase_status: "other" }).success,
    ).toBe(false);
  });
});
