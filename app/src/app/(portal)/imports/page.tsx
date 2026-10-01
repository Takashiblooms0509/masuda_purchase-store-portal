import { businessSession } from "@/lib/business/access";
import Link from "next/link";
import { z } from "zod";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { UploadForm } from "./upload-form";
import { uploadConfigured, readingConfigured } from "@/lib/documents/config";
import { ImportForm } from "./form";
import { datetime, importTypes, processingLabels } from "@/lib/business/format";
export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; document?: string }>;
}) {
  const { supabase, stores } = await businessSession();
  const params = await searchParams;
  const documentId = z.uuid().safeParse(params.document).success
    ? params.document!
    : "";
  const page = Math.max(
    1,
    Math.min(10000, Math.trunc(Number(params.page) || 1)),
  );
  let query = supabase.from("document_imports").select("*", { count: "exact" });
  if (documentId) query = query.eq("id", documentId);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (error) throw new Error("原本情報を取得できません。");
  return (
    <>
      <PageTitle
        title="データ取込"
        description="買取計算書画像をアップロードし、AI読取後に原本と照合して確認できます。"
      />
      <section className="card">
        <h2>買取計算書画像をアップロード</h2>
        <UploadForm
          stores={stores}
          enabled={uploadConfigured()}
          autoRead={readingConfigured()}
        />
        <details className="section-detail">
          <summary>原本情報だけを登録</summary>
          <p className="muted">
            ファイル名と種別を登録できます。この操作では画像やAI読取結果は登録されません。
          </p>
          <ImportForm stores={stores} />
        </details>
      </section>
      <section className="card">
        <h2>原本一覧</h2>
        {documentId && (
          <p className="muted">
            選択した原本を表示しています。
            <Link className="text-link" href="/imports">
              すべての原本を表示
            </Link>
          </p>
        )}
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
                    <td>
                      <Link className="text-link" href={`/imports/${d.id}`}>
                        {d.file_name}
                      </Link>
                    </td>
                    <td>{stores.find((s) => s.id === d.store_id)?.name}</td>
                    <td>{importTypes[d.document_type]}</td>
                    <td>{datetime(d.created_at)}</td>
                    <td>
                      <span className="badge">
                        {processingLabels[d.processing_status]}
                      </span>
                    </td>
                    <td>
                      {d.file_url ? (
                        <Link
                          className="text-link"
                          href={`/api/documents/import/${d.id}/image`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          画像を表示
                        </Link>
                      ) : (
                        "画像未登録"
                      )}
                      <Link
                        className="cell-sub text-link"
                        href={`/imports/${d.id}`}
                      >
                        原本・読取結果を確認
                      </Link>
                    </td>
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
          href={(p) =>
            `/imports?${new URLSearchParams({ page: String(p), document: documentId })}`
          }
        />
      </section>
    </>
  );
}
