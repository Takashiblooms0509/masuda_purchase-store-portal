import Link from "next/link";
import { businessSession } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { z } from "zod";
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, stores, profile } = await businessSession();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const field =
    params.field === "phone"
      ? "phone"
      : params.field === "membership_card_number"
        ? "membership_card_number"
        : "name";
  const storeId =
    typeof params.store === "string" && z.uuid().safeParse(params.store).success
      ? params.store
      : "";
  const page = Math.max(
    1,
    Math.min(10000, Math.trunc(Number(params.page) || 1)),
  );
  let query = supabase
    .from("customers")
    .select(
      "id,name,store_id,membership_card_number,phone,address,first_visit_date,last_visit_date",
      { count: "exact" },
    );
  if (q) query = query.ilike(field, `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (storeId) query = query.eq("store_id", storeId);
  const {
    data: customers,
    error,
    count,
  } = await query
    .order("updated_at", { ascending: false })
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (error)
    throw new Error(
      "顧客一覧を取得できません。Phase2のmigration設定を確認してください。",
    );
  const href = (p: number) =>
    `/customers?${new URLSearchParams({ q, field, store: storeId, page: String(p) })}`;
  return (
    <>
      <PageTitle
        title="顧客管理"
        description="店舗別の顧客情報を検索・登録・編集します。"
        href="/customers/new"
        action="顧客を登録"
      />
      <section className="card">
        <form className="filter-bar">
          <label>
            検索対象
            <select aria-label="検索対象" name="field" defaultValue={field}>
              <option value="name">顧客名</option>
              <option value="membership_card_number">カード番号</option>
              <option value="phone">電話番号</option>
            </select>
          </label>
          <label>
            検索キーワード
            <input name="q" defaultValue={q} maxLength={100} />
          </label>
          {profile.role === "admin" && (
            <label>
              店舗
              <select aria-label="店舗" name="store" defaultValue={storeId}>
                <option value="">全店舗</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button>検索</button>
          <Link className="text-link" href="/customers">
            解除
          </Link>
        </form>
      </section>
      <section className="card">
        <div className="table-scroll">
          {!customers?.length ? (
            <Empty>該当する顧客はありません。</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>顧客名</th>
                  {profile.role === "admin" && <th>店舗</th>}
                  <th>カード番号</th>
                  <th>電話番号</th>
                  <th>住所</th>
                  <th>初回来店</th>
                  <th>最終来店</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="text-link" href={`/customers/${c.id}`}>
                        {c.name}
                      </Link>
                    </td>
                    {profile.role === "admin" && (
                      <td>{stores.find((s) => s.id === c.store_id)?.name}</td>
                    )}
                    <td>{c.membership_card_number ?? "—"}</td>
                    <td>{c.phone ?? "—"}</td>
                    <td>{c.address ?? "—"}</td>
                    <td>{c.first_visit_date ?? "—"}</td>
                    <td>{c.last_visit_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} count={count ?? 0} href={href} />
      </section>
    </>
  );
}
