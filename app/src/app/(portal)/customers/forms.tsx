"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  saveCustomer,
  saveCustomerDocument,
  type CustomerState,
} from "./actions";
import { Feedback, StoreField } from "@/components/business-ui";
import { documentTypes } from "@/lib/business/format";
import type {
  Customer,
  CustomerFields,
  Store,
  CustomerDocument,
} from "@/types/database";

const fields: {
  key: Exclude<keyof CustomerFields, "dm_allowed">;
  label: string;
  type?: string;
  max: number;
}[] = [
  { key: "name", label: "氏名", max: 100 },
  { key: "name_kana", label: "フリガナ", max: 100 },
  { key: "birth_date", label: "生年月日", type: "date", max: 10 },
  { key: "occupation", label: "職業", max: 100 },
  {
    key: "membership_card_number",
    label: "メンバーズカード番号（リピーターNo.）",
    max: 100,
  },
  { key: "phone", label: "電話番号", type: "tel", max: 50 },
  { key: "postal_code", label: "郵便番号", max: 20 },
  { key: "address", label: "住所", max: 500 },
  { key: "identification_type", label: "本人確認書類の種類", max: 100 },
  { key: "identification_number", label: "本人確認書類番号", max: 100 },
];
export function CustomerForm({
  customer,
  stores,
}: {
  customer?: Customer;
  stores: Store[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(({ key }) => [key, customer?.[key] ?? ""])),
  );
  const [dm, setDm] = useState(
    customer?.dm_allowed === true
      ? "true"
      : customer?.dm_allowed === false
        ? "false"
        : "",
  );
  const [storeId, setStoreId] = useState(
    customer?.store_id ?? (stores.length === 1 ? stores[0].id : ""),
  );
  const [state, action, pending] = useActionState<CustomerState, FormData>(
    saveCustomer,
    { message: "" },
  );
  return (
    <form
      onReset={(event) => event.preventDefault()}
      action={action}
      className="stack"
    >
      <input type="hidden" name="id" value={customer?.id ?? ""} />
      <input type="hidden" name="review_key" value={state.reviewKey ?? ""} />
      <div className="form-grid">
        <StoreField
          stores={stores}
          storeId={storeId}
          locked={Boolean(customer)}
          onChange={setStoreId}
        />
        {fields.map(({ key, label, type, max }) => (
          <label key={key}>
            {label}
            {key === "name" && <span className="required"> 必須</span>}
            <input
              name={key}
              type={type ?? "text"}
              maxLength={max}
              required={key === "name"}
              value={values[key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <label>
          DM可否
          <select
            aria-label="DM可否"
            name="dm_allowed"
            value={dm}
            onChange={(e) => setDm(e.target.value)}
          >
            <option value="">不明・未確認</option>
            <option value="true">可</option>
            <option value="false">不可</option>
          </select>
        </label>
      </div>
      <Feedback state={state} />
      {state.candidates && (
        <section className="candidate-panel">
          <h2>既存顧客候補</h2>
          <p className="muted small">
            同じ店舗のカード番号・電話番号・氏名・生年月日で検索します。最大20件を表示します。
          </p>
          {state.candidates.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>顧客</th>
                    <th>カード番号</th>
                    <th>電話</th>
                    <th>生年月日</th>
                    <th>選択</th>
                  </tr>
                </thead>
                <tbody>
                  {state.candidates.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.membership_card_number ?? "—"}</td>
                      <td>{c.phone ?? "—"}</td>
                      <td>{c.birth_date ?? "—"}</td>
                      <td>
                        <Link className="text-link" href={`/customers/${c.id}`}>
                          既存顧客を利用
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small">
            既存顧客を選ぶと、その顧客詳細から取引を登録できます。入力内容を変更した場合は候補を再確認します。
          </p>
        </section>
      )}
      <div className="inline-actions">
        {customer ? (
          <button disabled={pending}>変更を保存</button>
        ) : (
          <>
            <button
              name="intent"
              value="check"
              className={state.reviewKey ? "secondary" : ""}
              disabled={pending}
            >
              既存候補を確認
            </button>
            {state.reviewKey && (
              <button name="intent" value="create" disabled={pending}>
                {state.candidates?.length
                  ? "候補とは別の新規顧客として登録"
                  : "新規顧客として登録"}
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
export function CustomerDocumentForm({
  customerId,
  document,
}: {
  customerId: string;
  document?: CustomerDocument;
}) {
  const [state, action, pending] = useActionState(saveCustomerDocument, {
    message: "",
  });
  return (
    <form
      onReset={(event) => event.preventDefault()}
      action={action}
      className="stack"
    >
      <input type="hidden" name="id" value={document?.id ?? ""} />
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="form-grid">
        <label>
          書類種別
          <select
            aria-label="書類種別"
            name="document_type"
            defaultValue={document?.document_type ?? "drivers_license"}
          >
            {Object.entries(documentTypes).map(([value, label]) => (
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
          {document ? "書類情報を更新" : "書類情報を登録"}
        </button>
      </div>
    </form>
  );
}
