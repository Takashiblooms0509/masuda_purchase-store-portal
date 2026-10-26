import { z } from "zod";
import type { Customer } from "@/types/database";

const optionalDate = z.union([
  z.literal(""),
  z.iso
    .date()
    .refine((value) => value >= "0001-01-01" && value <= "9999-12-31"),
]);
export const customerSearchSchema = z
  .object({
    name: z.string().trim().max(100),
    phone: z.string().trim().max(50),
    card: z.string().trim().max(100),
    store: z.union([z.literal(""), z.uuid()]),
    from: optionalDate,
    to: optionalDate,
    selected: z.union([z.literal(""), z.uuid()]),
    page: z.number().int().min(1).max(10000),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "登録日の開始日は終了日以前にしてください。",
  });
export type CustomerSearch = z.infer<typeof customerSearchSchema>;
export type DirectoryCustomer = Pick<
  Customer,
  | "id"
  | "store_id"
  | "name"
  | "name_kana"
  | "phone"
  | "membership_card_number"
  | "created_at"
>;

export function parseCustomerSearch(
  params: Record<string, string | string[] | undefined>,
) {
  const get = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const legacyField =
    get("field") === "phone"
      ? "phone"
      : get("field") === "membership_card_number"
        ? "card"
        : "name";
  const legacy = !["name", "phone", "card"].some((key) => key in params);
  const value = {
    name: get("name") || (legacy && legacyField === "name" ? get("q") : ""),
    phone: get("phone") || (legacy && legacyField === "phone" ? get("q") : ""),
    card: get("card") || (legacy && legacyField === "card" ? get("q") : ""),
    store: get("store"),
    from: get("from"),
    to: get("to"),
    selected: get("selected"),
    page: Math.max(1, Math.min(10000, Math.trunc(Number(get("page")) || 1))),
  };
  return { value, result: customerSearchSchema.safeParse(value) };
}
export function customerSearchHref(
  filters: CustomerSearch,
  patch: Partial<CustomerSearch> = {},
) {
  const values = { ...filters, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== "" && !(key === "page" && value === 1))
      params.set(key, String(value));
  }
  return `/customers${params.size ? `?${params}` : ""}`;
}
const directoryCustomerSchema = z.strictObject({
  id: z.uuid(),
  store_id: z.uuid(),
  name: z.string(),
  name_kana: z.string().nullable(),
  phone: z.string().nullable(),
  membership_card_number: z.string().nullable(),
  created_at: z.string(),
});
export const customerDirectorySchema = z.strictObject({
  customers: z.array(directoryCustomerSchema).max(30),
  total: z.number().int().nonnegative(),
  selected: directoryCustomerSchema.nullable(),
  stores: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
});
