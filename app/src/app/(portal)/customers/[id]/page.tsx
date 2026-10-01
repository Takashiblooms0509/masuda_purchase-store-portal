import Link from "next/link";
import { notFound } from "next/navigation";
import { businessSession, validId } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { CustomerForm, CustomerDocumentForm } from "../forms";
import { datetime, money, documentTypes } from "@/lib/business/format";
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const id = validId((await params).id);
  const { supabase, stores } = await businessSession();
  const page = Math.max(
    1,
    Math.min(10000, Math.trunc(Number((await searchParams).page) || 1)),
  );
  const [customerResult, documentsResult, historyResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("customer_documents")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_transactions")
      .select("*", { count: "exact" })
      .eq("customer_id", id)
      .order("visit_datetime", { ascending: false })
      .order("id")
      .range((page - 1) * 30, page * 30 - 1),
  ]);
  if (customerResult.error || documentsResult.error || historyResult.error)
    throw new Error("顧客情報を取得できません。");
  if (!customerResult.data) notFound();
  const customer = customerResult.data;
  return (
    <>
      <PageTitle
        title={customer.name}
        description={`初回来店：${customer.first_visit_date ?? "未登録"} ／ 最終来店：${customer.last_visit_date ?? "未登録"}`}
        href={`/purchases/new?customer=${id}`}
        action="この顧客の取引を登録"
      />
      <section className="card">
        <h2>顧客基本情報</h2>
        <CustomerForm customer={customer} stores={stores} />
      </section>
      <section className="card">
        <h2>本人確認書類</h2>
        <p className="muted">
          Phase2では書類情報を管理します。画像のアップロード・参照はPhase4で追加します。
        </p>
        {!documentsResult.data?.length ? (
          <Empty>書類情報はありません。</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>種別</th>
                <th>ファイル名</th>
                <th>登録日時</th>
                <th>編集</th>
              </tr>
            </thead>
            <tbody>
              {documentsResult.data.map((d) => (
                <tr key={d.id}>
                  <td>{documentTypes[d.document_type]}</td>
                  <td>{d.file_name}</td>
                  <td>{datetime(d.created_at)}</td>
                  <td>
                    <details>
                      <summary>編集</summary>
                      <CustomerDocumentForm customerId={id} document={d} />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <details className="section-detail">
          <summary>書類情報を追加</summary>
          <CustomerDocumentForm customerId={id} />
        </details>
      </section>
      <section className="card">
        <h2>過去の来店・買取履歴</h2>
        {!historyResult.data?.length ? (
          <Empty>取引履歴はありません。</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>来店日時</th>
                  <th>計算書番号</th>
                  <th>結果</th>
                  <th>点数</th>
                  <th>買取金額</th>
                </tr>
              </thead>
              <tbody>
                {historyResult.data.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link className="text-link" href={`/purchases/${t.id}`}>
                        {datetime(t.visit_datetime)}
                      </Link>
                    </td>
                    <td>{t.document_number ?? "—"}</td>
                    <td>
                      {t.transaction_status === "completed" ? "成約" : "不成約"}
                    </td>
                    <td>{t.purchase_item_count ?? "—"}</td>
                    <td>{money(t.purchase_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          count={historyResult.count ?? 0}
          href={(p) => `/customers/${id}?page=${p}`}
        />
      </section>
    </>
  );
}
