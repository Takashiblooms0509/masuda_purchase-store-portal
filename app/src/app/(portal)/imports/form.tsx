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
            name="document_type"
            defaultValue={document?.document_type ?? "purchase_document"}
          >
            {Object.entries(importTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
