import { businessSession } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { ImportForm } from "./form";
import { datetime, importTypes, processingLabels } from "@/lib/business/format";
export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { supabase, stores } = await businessSession();
  const page = Math.max(
    1,
    Math.min(10000, Math.trunc(Number((await searchParams).page) || 1)),
  );
  const { data, error, count } = await supabase
    .from("document_imports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (error) throw new Error("原本情報を取得できません。");
  return (
    <>
      <PageTitle
        title="データ取込"
        description="原本情報と処理状況の管理基盤です。画像アップロード・AI読取はPhase4で追加します。"
      />
      <section className="card">
        <h2>原本情報を登録</h2>
        <p className="muted">
          ファイル名と種別を登録できます。この操作では画像やAI読取結果は登録されません。
        </p>
        <ImportForm stores={stores} />
      </section>
      <section className="card">
        <h2>原本一覧</h2>
        {!data?.length ? (
          <Empty>原本情報はありません。</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ファイル名</th>
                  <th>店舗</th>
                  <th>種別</th>
                  <th>登録日時</th>
                  <th>処理状態</th>
                  <th>画像</th>
                  <th>編集</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td>{d.file_name}</td>
                    <td>{stores.find((s) => s.id === d.store_id)?.name}</td>
                    <td>{importTypes[d.document_type]}</td>
                    <td>{datetime(d.created_at)}</td>
                    <td>
                      <span className="badge">
                        {processingLabels[d.processing_status]}
                      </span>
                    </td>
                    <td>アップロード機能は準備中</td>
                    <td>
                      <details>
                        <summary>編集</summary>
                        <ImportForm document={d} stores={stores} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          count={count ?? 0}
          href={(p) => `/imports?page=${p}`}
        />
      </section>
    </>
  );
}
