import { z } from "zod";

export function currentMonth(now = new Date()) {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const month = date.slice(0, 7);
  const last = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${last}` };
}
const date = z.iso.date().refine((v) => v >= "1900-01-01" && v <= "9999-12-31");
export const homeFiltersSchema = z
  .object({
    from: date,
    to: date,
    store: z.union([z.literal("all"), z.uuid()]),
    category: z.union([z.literal("all"), z.literal("uncategorized"), z.uuid()]),
    day: z.union([z.literal(""), date]),
  })
  .refine(
    (v) =>
      v.from <= v.to &&
      (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
    {
      message: "日付は開始日から終了日の順で、366日以内に指定してください。",
    },
  )
  .refine((v) => !v.day || (v.day >= v.from && v.day <= v.to), {
    message: "詳細の日付は集計期間内で指定してください。",
  });
export type HomeFilters = z.infer<typeof homeFiltersSchema>;
export function parseHomeFilters(
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
) {
  const month = currentMonth(now);
  return homeFiltersSchema.safeParse({
    from: params.from ?? month.from,
    to: params.to ?? month.to,
    store: params.store ?? "all",
    category: params.category ?? "all",
    day: params.day ?? "",
  });
}
export function homeHref(filters: HomeFilters, day = "") {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    store: filters.store,
    category: filters.category,
  });
  if (day) params.set("day", day);
  return `/?${params}`;
}
const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();
const summarySchema = z.object({
  visits: count,
  completed: count,
  not_completed: count,
  pending: count,
  amount,
  unpriced: count,
});
export const homeReportSchema = z.object({
  summary: summarySchema,
  daily: z.array(summarySchema.extend({ day: date })).max(366),
  recent: z
    .array(
      summarySchema.omit({ visits: true }).extend({
        id: z.uuid(),
        store_id: z.uuid(),
        document_number: z.string().nullable(),
        visit_datetime: z.string(),
      }),
    )
    .max(5),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        purchase_transaction_id: z.uuid(),
        item_name: z.string(),
        purchase_amount: amount.nullable(),
        purchase_status: z.enum(["pending", "completed", "not_completed"]),
        display_order: z.number().int(),
        visit_datetime: z.string(),
      }),
    )
    .max(100),
  categories: z.array(
    z.object({ id: z.uuid().nullable(), name: z.string(), amount }),
  ),
  item_count: count,
});
export type HomeReport = z.infer<typeof homeReportSchema>;
export const conversionRate = (completed: number, notCompleted: number) =>
  completed + notCompleted
    ? `${((100 * completed) / (completed + notCompleted)).toFixed(1)}%`
    : "—";
