import Link from "next/link";
import { readingConfigured } from "@/lib/documents/config";
import { processingCutoff } from "@/lib/documents/processing";
import { ReadButton } from "../imports/read-button";
import { z } from "zod";
import { businessSession } from "@/lib/business/access";
import { PageTitle, Empty, Pagination } from "@/components/business-ui";
import { datetime, importTypes, processingLabels } from "@/lib/business/format";

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; page?: string }>;
}) {
  const { supabase, profile, stores } = await businessSession();
  const params = await searchParams;
  const storeId = z.uuid().safeParse(params.store).success ? params.store! : "";
  const page = Math.max(
    1,
    Math.min(10000, Math.trunc(Number(params.page) || 1)),
  );
  let query = supabase
    .from("document_imports")
    .select(
      "id,store_id,file_name,created_at,document_type,processing_status,processing_started_at,error_message,retry_count,file_url,file_size",
      { count: "exact" },
    )
    .or(
      `processing_status.eq.failed,and(processing_status.eq.processing,processing_started_at.lt.${processingCutoff()})`,
    );
  if (storeId) query = query.eq("store_id", storeId);
  const {
    data: imports,
    error,
    count,
  } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (error) throw new Error("読取エラー一覧を取得できません。");
  return (
    <>
      <PageTitle
        title="エラー一覧"
        description="画像読取に失敗した原本と、エラー内容を確認できます。"
      />
      <p id="retry-help" className="notice warning">
        再処理では画像をOpenAIへ送信します。完了後は原本と照合して読取結果を確認してください。
      </p>
      {profile.role === "admin" && (
        <section className="card">
          <form className="filter-bar">
            <label>
              店舗
              <select aria-label="店舗" name="store" defaultValue={storeId}>
                <option value="">全店舗</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <button>絞り込む</button>
            <Link className="text-link" href="/errors">
              解除
            </Link>
          </form>
        </section>
      )}
      <section className="card">
        {!imports?.length ? (
          <Empty>読取エラーはありません。</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ファイル名</th>
                  {profile.role === "admin" && <th>店舗</th>}
                  <th>取込日時</th>
                  <th>ファイル種別</th>
                  <th>処理ステータス</th>
                  <th>エラー内容</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((document) => (
                  <tr key={document.id}>
                    <td className="file-name">{document.file_name}</td>
                    {profile.role === "admin" && (
                      <td>
                        {stores.find((store) => store.id === document.store_id)
                          ?.name ?? "—"}
                      </td>
                    )}
                    <td>{datetime(document.created_at)}</td>
                    <td>{importTypes[document.document_type]}</td>
                    <td>
                      <span className="badge failed">
                        {document.processing_status === "processing"
                          ? "処理タイムアウト"
                          : processingLabels[document.processing_status]}
                      </span>
                      <span className="cell-sub">
                        再試行 {document.retry_count}回
                      </span>
                    </td>
                    <td className="import-error-message">
                      {(document.processing_status === "processing"
                        ? "前回の処理が終了していません。再処理できます。"
                        : document.error_message) ||
                        "エラーの詳細は記録されていません。"}
                    </td>
                    <td>
                      <ReadButton
                        id={document.id}
                        status={document.processing_status}
                        enabled={
                          readingConfigured() &&
                          document.document_type === "purchase_document" &&
                          Boolean(document.file_url && document.file_size)
                        }
                        expired={document.processing_status === "processing"}
                      />
                      <Link
                        className="cell-sub text-link"
                        href={`/imports/${document.id}`}
                      >
                        原本情報を確認
                      </Link>
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
          href={(next) =>
            `/errors?${new URLSearchParams({ store: storeId, page: String(next) })}`
          }
        />
      </section>
    </>
  );
}
