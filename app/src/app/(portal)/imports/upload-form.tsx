"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { SOURCE_BUCKET, MAX_IMAGE_BYTES } from "@/lib/documents/limits";
import { StoreField } from "@/components/business-ui";
import { beginUpload, finishUpload } from "./upload-actions";
import { documentTypes } from "@/lib/business/format";
import type { Store } from "@/types/database";
export function UploadForm({
  stores,
  storeId,
  id,
  kind = "import",
  customerId = null,
  documentType = "purchase_document",
  enabled,
  autoRead = false,
}: {
  stores: Store[];
  storeId?: string;
  id?: string;
  kind?: "import" | "customer_document";
  customerId?: string | null;
  documentType?: string;
  enabled: boolean;
  autoRead?: boolean;
}) {
  const router = useRouter();
  const [selectedType, setType] = useState(documentType);
  const [selectedStore, setStore] = useState(
    storeId ?? (stores.length === 1 ? stores[0].id : ""),
  );
  const [file, setFile] = useState<File | null>(null),
    [resolvedId, setId] = useState(id ?? null);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [uploadNumber, setUploadNumber] = useState(0);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !file ||
      !selectedStore ||
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > MAX_IMAGE_BYTES ||
      !file.size
    ) {
      setMessage("店舗と、10MB以下のJPG・JPEG・PNG画像を選んでください。");
      return;
    }
    setPending(true);
    setMessage("アップロードを準備しています。");
    try {
      const prepared = await beginUpload({
        kind,
        id: resolvedId,
        store_id: selectedStore,
        customer_id: customerId,
        document_type: selectedType,
        file_name: file.name,
        mime: file.type,
        size: file.size,
      });
      if (!prepared.upload) {
        setMessage(prepared.message);
        return;
      }
      setId(prepared.upload.id);
      setMessage("画像を転送しています。");
      const { url, key } = getSupabaseConfig();
      const client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      await client.storage
        .from(SOURCE_BUCKET)
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
          contentType: file.type,
          upsert: false,
        });
      setMessage("画像を確認しています。");
      const completed = await finishUpload(kind, prepared.upload.id);
      setMessage(completed.message);
      if (completed.success) {
        if (kind === "import") {
          if (autoRead && selectedType === "purchase_document") {
            setMessage("画像を保存しました。読み取っています。");
            try {
              await fetch(`/api/imports/${prepared.upload.id}/read`, {
                method: "POST",
              });
            } catch {
              /* 保存済み画像と処理状況は詳細画面で確認できる。 */
            }
          }
          router.push(`/imports/${prepared.upload.id}`);
        } else {
          if (!id) {
            setId(null);
            setFile(null);
            setUploadNumber((number) => number + 1);
          }
          router.refresh();
        }
      }
    } catch {
      setMessage(
        "画像を保存できませんでした。接続状態を確認して再試行してください。",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="stack" onSubmit={upload}>
      {!enabled && (
        <p className="notice warning">
          画像保存の準備が完了していません。管理者に確認してください。
        </p>
      )}
      <StoreField
        stores={stores}
        storeId={selectedStore}
        onChange={setStore}
        locked={pending || Boolean(storeId) || Boolean(resolvedId)}
      />
      {kind === "customer_document" && !id && (
        <label>
          書類種別
          <select
            aria-label="書類種別"
            disabled={pending}
            value={selectedType}
            onChange={(event) => setType(event.target.value)}
          >
            {Object.entries(documentTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        画像ファイル
        <input
          key={uploadNumber}
          aria-label="画像ファイル"
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={pending || !enabled}
          required
        />
      </label>
      <p className="muted small">
        JPG・JPEG・PNG、10MB以下・4,000万画素以下。原本画像は非公開で保存します。画像の差替えはできません。
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="inline-actions">
        <button disabled={pending || !enabled}>
          {pending
            ? "処理中…"
            : autoRead &&
                kind === "import" &&
                selectedType === "purchase_document"
              ? "画像を保存して読み取る"
              : "画像を保存"}
        </button>
        {!id && resolvedId && !pending && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setId(null);
              setMessage("別の画像を選んで登録してください。");
            }}
          >
            別の原本として登録し直す
          </button>
        )}
      </div>
    </form>
  );
}
