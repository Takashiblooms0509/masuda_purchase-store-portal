import Link from "next/link";
import { businessSession, storeAllowed } from "@/lib/business/access";
import { homeReportSchema, parseHomeFilters } from "@/lib/home/report";
import { HomeDashboard } from "@/components/home/dashboard";

export const metadata = { title: "HOME · GREEN ASSET PORTAL" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Revalidate the actual user/profile and let PostgreSQL apply existing store RLS.
  const session = await businessSession();
  const parsed = parseHomeFilters(await searchParams);
  if (!parsed.success)
    return (
      <section className="card">
        <h1>HOME</h1>
        <p role="alert">
          日付・店舗・カテゴリの条件を確認してください。期間は366日以内です。
        </p>
        <Link className="text-link" href="/">
          当月に戻す
        </Link>
      </section>
    );
  const filters = parsed.data;
  if (filters.store !== "all" && !storeAllowed(session, filters.store)) {
    return (
      <section className="card">
        <h1>HOME</h1>
        <p role="alert">この店舗の集計は閲覧できません。</p>
        <Link className="text-link" href="/">
          閲覧可能な店舗に戻す
        </Link>
      </section>
    );
  }
  const [report, categories] = await Promise.all([
    session.supabase.rpc("get_home_report", {
      p_from: filters.from,
      p_to: filters.to,
      p_store: filters.store === "all" ? null : filters.store,
      p_day: filters.day || null,
      p_category: ["all", "uncategorized"].includes(filters.category)
        ? null
        : filters.category,
      p_uncategorized: filters.category === "uncategorized",
    }),
    session.supabase
      .from("product_categories")
      .select("id,category_name,is_active")
      .order("display_order")
      .order("id"),
  ]);
  const data = homeReportSchema.safeParse(report.data);
  if (report.error || categories.error || !data.success) {
    // Never show zero/demo values or database error details after a failed read.
    throw new Error(
      "HOMEを取得できません。接続状態とHOME集計SQLの適用状況を確認してください。",
    );
  }
  return (
    <HomeDashboard
      filters={filters}
      report={data.data}
      stores={session.stores
        .filter(
          (s) =>
            session.profile.role === "admin" ||
            (s.id === session.profile.store_id && s.is_active),
        )
        .map((s) => ({ id: s.id, name: s.name }))}
      categories={categories.data ?? []}
    />
  );
}
