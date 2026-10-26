import Link from "next/link";
import { businessSession, storeAllowed } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { CustomerDetailPanel } from "@/components/customers/detail-panel";
import {
  customerSearchHref,
  customerDirectorySchema,
  parseCustomerSearch,
} from "@/lib/customers/search";
import { datetime } from "@/lib/business/format";
import { CustomerForm } from "./forms";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await businessSession();
  const { supabase, stores: writableStores, profile } = session;
  const { value, result } = parseCustomerSearch(await searchParams);
  let errorMessage = !result.success
    ? "検索条件を確認してください。登録日は0001年から9999年の正しい日付で、開始日から終了日の順に指定してください。"
    : "";
  let report: ReturnType<typeof customerDirectorySchema.parse> | null = null;
  if (result.success) {
    const filters = result.data;
    try {
      const { data, error } = await supabase.rpc("get_customer_directory", {
        p_name: filters.name,
        p_phone: filters.phone,
        p_card: filters.card,
        p_store: filters.store || null,
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_selected: filters.selected || null,
        p_page: filters.page,
      });
      const parsed = customerDirectorySchema.safeParse(data);
      if (error || !parsed.success)
        errorMessage =
          "顧客情報を取得できません。時間をおいて再度お試しください。";
      else report = parsed.data;
    } catch {
      errorMessage =
        "顧客情報を取得できません。時間をおいて再度お試しください。";
    }
  }
  // Directory store labels are read-only; never feed them into businessSession/storeAllowed.
  const stores = report?.stores ?? writableStores;
  const filterForm = (
    <section className="card">
      <form
        className="customer-search"
        key={JSON.stringify([
          value.name,
          value.phone,
          value.card,
          value.store,
          value.from,
          value.to,
        ])}
      >
        <label>
          顧客名・フリガナ
          <input name="name" defaultValue={value.name} maxLength={100} />
        </label>
        <label>
          登録店舗
          <select name="store" aria-label="登録店舗" defaultValue={value.store}>
            <option value="">全店舗</option>
            {stores.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          電話番号
          <input
            name="phone"
            type="tel"
            defaultValue={value.phone}
            maxLength={50}
          />
        </label>
        <label>
          リピーターズカード番号
          <input name="card" defaultValue={value.card} maxLength={100} />
        </label>
        <label>
          登録日 FROM
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            name="from"
            defaultValue={value.from}
          />
        </label>
        <label>
          登録日 TO
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            name="to"
            defaultValue={value.to}
          />
        </label>
        <div className="inline-actions">
          <button>検索</button>
          <Link className="text-link" href="/customers">
            条件を解除
          </Link>
        </div>
      </form>
      <p className="muted small">
        氏名またはフリガナの部分一致と、その他の入力条件すべてに一致する顧客を検索します。登録日は日本時間です。
      </p>
    </section>
  );
  const title = (
    <PageTitle
      title="顧客管理"
      description="登録店舗や連絡先から検索し、一覧の右側で顧客情報を確認できます。"
      href="/customers/new"
      action="顧客を登録"
    />
  );
  if (errorMessage || !result.success || !report)
    return (
      <>
        {title}
        {filterForm}
        <p role="alert" className="notice error">
          {errorMessage}
        </p>
      </>
    );
  const filters = result.data;
  const { customers, total: count, selected } = report;
  const editResult =
    selected && profile.role === "admin"
      ? await supabase
          .from("customers")
          .select("*")
          .eq("id", selected.id)
          .maybeSingle()
      : { data: null, error: null };
  const editError = editResult.error
    ? "顧客編集情報を取得できません。再度選択してください。"
    : "";
  return (
    <>
      {title}
      {filterForm}
      {editError && (
        <p role="alert" className="notice error">
          {editError}
        </p>
      )}
      <div className={`customer-workspace ${selected ? "has-selection" : ""}`}>
        <section className="card customer-list">
          <div className="table-scroll">
            {!customers?.length ? (
              <Empty>該当する顧客はありません。</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>顧客名</th>
                    <th>登録店舗</th>
                    <th>電話番号</th>
                    <th>カード番号</th>
                    <th>登録日時</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className={
                        selected?.id === c.id ? "customer-selected" : undefined
                      }
                    >
                      <td>
                        <Link
                          className="text-link"
                          href={customerSearchHref(filters, { selected: c.id })}
                          scroll={false}
                          aria-current={
                            selected?.id === c.id ? "true" : undefined
                          }
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td>
                        {stores.find((s) => s.id === c.store_id)?.name ?? "—"}
                      </td>
                      <td>{c.phone ?? "—"}</td>
                      <td>{c.membership_card_number ?? "—"}</td>
                      <td>{datetime(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Pagination
            page={filters.page}
            count={count ?? 0}
            href={(page) => customerSearchHref(filters, { page, selected: "" })}
          />
        </section>
        {selected && (
          <CustomerDetailPanel
            key={`${profile.id}:${profile.role}:${selected.id}`}
            customer={selected}
            storeName={
              stores.find((s) => s.id === selected.store_id)?.name ?? "—"
            }
            closeHref={customerSearchHref(filters, { selected: "" })}
            editForm={
              editResult.data && !editResult.error ? (
                <CustomerForm
                  customer={editResult.data}
                  stores={writableStores}
                />
              ) : undefined
            }
            relatedHref={
              storeAllowed(session, selected.store_id)
                ? `/customers/${selected.id}`
                : undefined
            }
          />
        )}
        {filters.selected && !selected && (
          <aside className="card">
            <p role="status">顧客が見つからないか、閲覧権限がありません。</p>
            <Link
              className="text-link"
              href={customerSearchHref(filters, { selected: "" })}
            >
              選択を解除
            </Link>
          </aside>
        )}
      </div>
    </>
  );
}
