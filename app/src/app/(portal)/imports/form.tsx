"use client";
import { useActionState } from "react";
import { saveImport } from "./actions";
import { Feedback, StoreField } from "@/components/business-ui";
import { importTypes } from "@/lib/business/format";
import type { DocumentImport, Store } from "@/types/database";
export function ImportForm({
  document,
  stores,
}: {
  document?: DocumentImport;
  stores: Store[];
}) {
  const [state, action, pending] = useActionState(saveImport, { message: "" });
  const typeLocked = Boolean(
    document &&
    (document.upload_path ||
      document.file_url ||
      document.processing_status !== "pending"),
  );
  return (
    <form
      onReset={(event) => event.preventDefault()}
      action={action}
      className="stack"
    >
      <input type="hidden" name="id" value={document?.id ?? ""} />
      <div className="form-grid">
        <StoreField
          stores={stores}
          storeId={document?.store_id}
          locked={Boolean(document)}
        />
        <label>
          書類種別
          <select
            aria-label="書類種別"
            disabled={typeLocked}
            name="document_type"
            defaultValue={document?.document_type ?? "purchase_document"}
          >
            {Object.entries(importTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {typeLocked && (
            <input
              type="hidden"
              name="document_type"
              value={document!.document_type}
            />
          )}
        </label>
        <label>
          ファイル名
          <input
            name="file_name"
            required
            maxLength={255}
            defaultValue={document?.file_name}
          />
        </label>
      </div>
      <Feedback state={state} />
      <div>
        <button disabled={pending}>
          {document ? "変更を保存" : "原本情報を登録"}
        </button>
      </div>
    </form>
  );
}
