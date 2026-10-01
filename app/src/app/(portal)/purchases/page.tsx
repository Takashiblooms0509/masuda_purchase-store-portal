import Link from "next/link";
import { businessSession } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { datetime, money, processingLabels } from "@/lib/business/format";
import { z } from "zod";
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { supabase, stores, profile } = await businessSession();
  const p = await searchParams;
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(p.page) || 1)));
  const store = z.uuid().safeParse(p.store).success ? p.store! : "";
  const customer = z.uuid().safeParse(p.customer).success ? p.customer! : "";
  const date = z.iso.date().safeParse(p.date).success ? p.date! : "";
  const status =
    p.status === "completed" || p.status === "not_completed" ? p.status : "";
  let query = supabase
    .from("purchase_transactions")
    .select("*", { count: "exact" });
  if (store) query = query.eq("store_id", store);
  if (customer) query = query.eq("customer_id", customer);
  if (status) query = query.eq("transaction_status", status);
  if (date) {
    const start = new Date(`${date}T00:00:00+09:00`);
    query = query
      .gte("visit_datetime", start.toISOString())
      .lt("visit_datetime", new Date(start.getTime() + 86400000).toISOString());
  }
  const {
    data: transactions,
    error,
    count,
  } = await query
    .order("visit_datetime", { ascending: false })
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (error) throw new Error("取引一覧を取得できません。");
  const customerIds = [
    ...new Set((transactions ?? []).map((t) => t.customer_id)),
  ];
  const sourceIds = [
    ...new Set(
      (transactions ?? [])
        .map((t) => t.source_document_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [customersResult, importsResult] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id,name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    sourceIds.length
      ? supabase
          .from("document_imports")
          .select("id,processing_status")
          .in("id", sourceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersResult.error || importsResult.error)
    throw new Error("取引の関連情報を取得できません。");
  const href = (n: number) =>
    `/purchases?${new URLSearchParams({ store, customer, date, status, page: String(n) })}`;
  return (
    <>
      <PageTitle
        title="買取実績"
        description="来店・成約・不成約を計算書単位で管理します。"
        href="/purchases/new"
        action="取引を登録"
      />
      <section className="card">
        <form className="filter-bar">
          <label>
            来店日（日本時間）
            <input type="date" name="date" defaultValue={date} />
          </label>
          <label>
            結果
            <select aria-label="結果" name="status" defaultValue={status}>
              <option value="">すべて</option>
              <option value="completed">成約</option>
              <option value="not_completed">不成約</option>
            </select>
          </label>
          {profile.role === "admin" && (
            <label>
              店舗
              <select aria-label="店舗" name="store" defaultValue={store}>
                <option value="">全店舗</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {customer && <input type="hidden" name="customer" value={customer} />}
          <button>絞り込む</button>
          <Link className="text-link" href="/purchases">
            解除
          </Link>
        </form>
        {customer && (
          <p className="muted small">
            顧客で絞り込み中です。顧客詳細から履歴を確認できます。
          </p>
        )}
      </section>
      <section className="card">
        {!transactions?.length ? (
          <Empty>該当する取引はありません。</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>来店日時</th>
                  <th>計算書番号</th>
                  <th>顧客</th>
                  <th>結果</th>
                  <th>点数</th>
                  <th>買取金額</th>
                  <th>原本処理</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const source = importsResult.data?.find(
                    (d) => d.id === t.source_document_id,
                  );
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link className="text-link" href={`/purchases/${t.id}`}>
                          {datetime(t.visit_datetime)}
                        </Link>
                      </td>
                      <td>{t.document_number ?? "—"}</td>
                      <td>
                        <Link
                          className="text-link"
                          href={`/customers/${t.customer_id}`}
                        >
                          {customersResult.data?.find(
                            (c) => c.id === t.customer_id,
                          )?.name ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={`badge ${t.transaction_status === "not_completed" ? "inactive" : ""}`}
                        >
                          {t.transaction_status === "completed"
                            ? "成約"
                            : "不成約"}
                        </span>
                      </td>
                      <td>{t.purchase_item_count ?? "—"}</td>
                      <td>{money(t.purchase_total)}</td>
                      <td>
                        {source
                          ? processingLabels[source.processing_status]
                          : "原本なし"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} count={count ?? 0} href={href} />
      </section>
    </>
  );
}
