import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { businessSession, validId } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { CustomerForm, CustomerDocumentForm } from "../forms";
import { UploadForm } from "../../imports/upload-form";
import { uploadConfigured } from "@/lib/documents/config";
import { datetime, money, documentTypes } from "@/lib/business/format";
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const id = validId((await params).id);
  const { supabase, stores, profile } = await businessSession();
  if (profile.role !== "admin") redirect(`/customers?selected=${id}`);
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
        {profile.role === "admin" ? (
          <CustomerForm customer={customer} stores={stores} />
        ) : (
          <dl className="customer-facts">
            {[
              ["氏名", customer.name],
              ["フリガナ", customer.name_kana],
              ["生年月日", customer.birth_date],
              ["職業", customer.occupation],
              ["郵便番号", customer.postal_code],
              ["住所", customer.address],
              ["電話番号", customer.phone],
              ["リピーターズカード番号", customer.membership_card_number],
              [
                "DM可否",
                customer.dm_allowed === null
                  ? "未確認"
                  : customer.dm_allowed
                    ? "可"
                    : "不可",
              ],
              ["本人確認書類の種類", customer.identification_type],
              ["本人確認書類番号", customer.identification_number],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section className="card">
        <h2>本人確認書類</h2>
        <p className="muted">
          本人確認書類画像は非公開で保存します。顧客ごとに複数画像を登録できます。
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
                <th>画像</th>
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
                    {d.file_url ? (
                      <Link
                        className="text-link"
                        href={`/api/documents/customer_document/${d.id}/image`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        画像を表示
                      </Link>
                    ) : (
                      <details>
                        <summary>画像を追加</summary>
                        <UploadForm
                          stores={stores}
                          storeId={customer.store_id}
                          id={d.id}
                          kind="customer_document"
                          customerId={id}
                          documentType={d.document_type}
                          enabled={uploadConfigured()}
                        />
                      </details>
                    )}
                  </td>
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
          <summary>本人確認書類画像を追加</summary>
          <UploadForm
            stores={stores}
            storeId={customer.store_id}
            kind="customer_document"
            customerId={id}
            documentType="drivers_license"
            enabled={uploadConfigured()}
          />
        </details>
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
