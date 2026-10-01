import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { businessSession, validId } from "@/lib/business/access";
import { uploadConfigured, readingConfigured } from "@/lib/documents/config";
import { processingExpired } from "@/lib/documents/processing";
import {
  aiReadSchema,
  reviewSchema,
  AI_SCHEMA_VERSION,
} from "@/lib/ai/schemas";
import { PageTitle } from "@/components/business-ui";
import { importTypes, processingLabels, datetime } from "@/lib/business/format";
import { UploadForm } from "../upload-form";
import { ReadButton } from "../read-button";
import { ReviewForm } from "../review-form";
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const id = validId((await params).id);
  const { supabase, stores } = await businessSession();
  const { data: document, error } = await supabase
    .from("document_imports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("原本情報を取得できません。");
  if (!document) notFound();
  const linked = await supabase
    .from("purchase_transactions")
    .select("id")
    .eq("source_document_id", id)
    .maybeSingle();
  if (linked.error) throw new Error("原本の登録状況を確認できません。");
  const raw = aiReadSchema.safeParse(document.ai_result),
    review = reviewSchema.safeParse(document.reviewed_result);
  const supported =
    document.ai_schema_version === AI_SCHEMA_VERSION &&
    raw.success &&
    review.success;
  const expired =
    document.processing_status === "processing" &&
    processingExpired(document.processing_started_at ?? document.created_at);
  const storeName =
    stores.find((store) => store.id === document.store_id)?.name ?? "";
  const source = `/api/documents/import/${id}/image`;
  return (
    <>
      <PageTitle
        title="原本・読取結果の確認"
        description={`${document.file_name} · ${importTypes[document.document_type]} · ${storeName}`}
      />
      <p className="muted">
        取込日時：{datetime(document.created_at)} · 処理状況：
        {expired
          ? "処理タイムアウト"
          : processingLabels[document.processing_status]}
      </p>
      {(await searchParams).saved === "1" && (
        <p className="notice success">確認内容を保存しました。</p>
      )}
      {document.error_message && (
        <p className="notice error">{document.error_message}</p>
      )}
      {expired && (
        <p className="notice warning">
          前回の処理が終了していません。再処理すると、新しい処理の結果を採用します。
        </p>
      )}
      <div className="review-layout">
        <section className="card source-panel">
          <h2>原本画像</h2>
          {document.file_url ? (
            <>
              <div className="source-image">
                <Image
                  src={source}
                  alt="確認用の原本画像"
                  fill
                  unoptimized
                  sizes="(max-width:1000px) 100vw, 45vw"
                  style={{ objectFit: "contain" }}
                />
              </div>
              <Link
                className="text-link"
                href={source}
                target="_blank"
                rel="noopener noreferrer"
              >
                原本を大きく表示
              </Link>
            </>
          ) : (
            <UploadForm
              stores={stores}
              storeId={document.store_id}
              id={id}
              documentType={document.document_type}
              enabled={uploadConfigured()}
              autoRead={readingConfigured()}
            />
          )}
        </section>
        <div>
          {linked.data ? (
            <section className="card">
              <h2>取引登録済みの原本</h2>
              <p>この原本はすでに取引に紐づいています。</p>
              <Link className="text-link" href={`/purchases/${linked.data.id}`}>
                登録済み取引を確認
              </Link>
            </section>
          ) : (
            <>
              {document.document_type === "purchase_document" &&
                document.file_url &&
                document.processing_status !== "completed" &&
                document.processing_status !== "review_required" && (
                  <section className="card">
                    <h2>画像読取</h2>
                    <p>
                      画像をOpenAIへ送信して読み取ります。読取後は原本と照合して修正してください。
                    </p>
                    {!readingConfigured() && (
                      <p className="notice warning">
                        画像読取の準備が完了していません。管理者に確認してください。
                      </p>
                    )}
                    <ReadButton
                      id={id}
                      status={document.processing_status}
                      enabled={readingConfigured()}
                      expired={expired}
                    />
                  </section>
                )}
              {document.document_type !== "purchase_document" && (
                <section className="card">
                  <p>この書類種別は画像の保管・参照のみ対応しています。</p>
                </section>
              )}
              {document.processing_status === "review_required" &&
                (supported && review.success && raw.success ? (
                  <>
                    {!!raw.data.warnings.length && (
                      <section className="card">
                        <h2>AIからの確認事項</h2>
                        <ul>
                          {raw.data.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    <p className="muted small">
                      登録先店舗は{storeName}
                      です。帳票の店舗名から登録先を自動変更しません。
                    </p>
                    <ReviewForm
                      id={id}
                      updatedAt={document.updated_at}
                      initial={review.data}
                      key={document.updated_at}
                    />
                  </>
                ) : (
                  <section className="card">
                    <p className="notice error">
                      確認用データの形式を読み取れません。管理者に確認してください。
                    </p>
                  </section>
                ))}
            </>
          )}
        </div>
      </div>
      <div className="inline-actions">
        <Link className="button secondary" href="/imports">
          原本一覧へ戻る
        </Link>
      </div>
    </>
  );
}
