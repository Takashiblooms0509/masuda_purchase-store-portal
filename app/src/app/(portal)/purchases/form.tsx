"use client";
import { useActionState, useState, useTransition } from "react";
import {
  saveTransaction,
  searchPurchaseCustomers,
  searchPurchaseImports,
} from "./actions";
import { Feedback, StoreField } from "@/components/business-ui";
import { toLocalInput } from "@/lib/business/format";
import type {
  Store,
  Customer,
  PurchaseTransaction,
  PurchaseItem,
  ProductCategory,
  DocumentImport,
} from "@/types/database";
type CustomerOption = Pick<
  Customer,
  "id" | "name" | "store_id" | "membership_card_number"
>;
type DraftItem = {
  id: string | null;
  product_category_id: string;
  item_name: string;
  denomination_or_weight: string;
  quantity: string;
  purchase_amount: string;
  category_reviewed: boolean;
  notes: string;
  raw_item_name: string | null;
  category_confidence: number | null;
};
function draft(item?: PurchaseItem): DraftItem {
  return {
    id: item?.id ?? null,
    product_category_id: item?.product_category_id ?? "",
    item_name: item?.item_name ?? "",
    denomination_or_weight: item?.denomination_or_weight ?? "",
    quantity: item?.quantity?.toString() ?? "",
    purchase_amount: item?.purchase_amount?.toString() ?? "",
    category_reviewed: item?.category_reviewed ?? false,
    notes: item?.notes ?? "",
    raw_item_name: item?.raw_item_name ?? null,
    category_confidence: item?.category_confidence ?? null,
  };
}
const headerFields = [
  ["document_number", "計算書番号", "text"],
  ["visit_datetime", "来店日時（日本時間）", "datetime-local"],
  ["purchase_staff_name", "買取担当者", "text"],
  ["payment_staff_name", "支払担当者", "text"],
  ["visit_source", "来店経路", "text"],
  ["visit_source_detail", "来店経路の詳細", "text"],
  ["purchase_item_count", "買取点数", "number"],
  ["purchase_total", "買取合計金額", "number"],
] as const;
export function TransactionForm({
  stores,
  customers,
  initialCustomer,
  transaction,
  items,
  categories,
  imports,
}: {
  stores: Store[];
  customers: CustomerOption[];
  initialCustomer?: CustomerOption;
  transaction?: PurchaseTransaction;
  items: PurchaseItem[];
  categories: ProductCategory[];
  imports: DocumentImport[];
}) {
  const initialStore =
    transaction?.store_id ??
    initialCustomer?.store_id ??
    (stores.length === 1 ? stores[0].id : "");
  const [storeId, setStoreId] = useState(initialStore);
  const [customerId, setCustomerId] = useState(
    transaction?.customer_id ?? initialCustomer?.id ?? "",
  );
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [search, setSearch] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [searching, startSearch] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      headerFields.map(([key]) => [
        key,
        key === "visit_datetime"
          ? toLocalInput(transaction?.visit_datetime ?? null)
          : String(transaction?.[key] ?? ""),
      ]),
    ),
  );
  const [status, setStatus] = useState(
    transaction?.transaction_status ?? "completed",
  );
  const [importOptions, setImportOptions] = useState(imports);
  const [importSearch, setImportSearch] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [sourceId, setSourceId] = useState(
    transaction?.source_document_id ?? "",
  );
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [lines, setLines] = useState<DraftItem[]>(() =>
    items.map((i) => draft(i)),
  );
  const [state, action, pending] = useActionState(saveTransaction, {
    message: "",
  });
  const changeItem = (
    index: number,
    key: keyof DraftItem,
    value: string | boolean,
  ) =>
    setLines((previous) =>
      previous.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  const payload = lines.map((line) => ({
    id: line.id,
    item_name: line.item_name,
    category_reviewed: line.category_reviewed,
    product_category_id: line.product_category_id || null,
    denomination_or_weight: line.denomination_or_weight || null,
    quantity: line.quantity === "" ? null : Number(line.quantity),
    purchase_amount:
      line.purchase_amount === "" ? null : Number(line.purchase_amount),
    notes: line.notes || null,
  }));
  const subtotal = lines.reduce(
    (sum, line) => sum + (Number(line.purchase_amount) || 0),
    0,
  );
  return (
    <form
      onReset={(event) => event.preventDefault()}
      action={action}
      className="stack"
    >
      <input type="hidden" name="id" value={transaction?.id ?? ""} />
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <section className="card">
        <h2>来店・取引情報</h2>
        <div className="form-grid">
          <StoreField
            stores={stores}
            storeId={storeId}
            locked={Boolean(transaction)}
            onChange={(id) => {
              setStoreId(id);
              setCustomerId("");
              setSourceId("");
              setSearchMessage("");
            }}
          />
          <label>
            顧客<span className="required"> 必須</span>
            <select
              aria-label="顧客"
              name="customer_id"
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">顧客を選択</option>
              {customerOptions
                .filter((c) => c.store_id === storeId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.membership_card_number
                      ? `（${c.membership_card_number}）`
                      : ""}
                  </option>
                ))}
            </select>
          </label>
          {headerFields.map(([key, label, type]) => (
            <label key={key}>
              {label}
              {key === "visit_datetime" && (
                <span className="required"> 必須</span>
              )}
              <input
                name={key}
                type={type}
                required={key === "visit_datetime"}
                min={type === "number" ? 0 : undefined}
                step={
                  key === "purchase_total"
                    ? "0.01"
                    : key === "purchase_item_count"
                      ? "1"
                      : undefined
                }
                maxLength={type === "text" ? 100 : undefined}
                value={values[key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label>
            成約 / 不成約
            <select
              aria-label="成約 / 不成約"
              name="transaction_status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "completed" | "not_completed")
              }
            >
              <option value="completed">成約</option>
              <option value="not_completed">不成約</option>
            </select>
          </label>
          <label>
            原本の紐付け
            <select
              aria-label="原本の紐付け"
              name="source_document_id"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">原本情報の紐付けなし</option>
              {importOptions
                .filter(
                  (d) =>
                    d.store_id === storeId &&
                    d.document_type === "purchase_document",
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name}
                  </option>
                ))}
            </select>
          </label>
          <label className="wide">
            備考
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <div className="lookup-panel">
          <label>
            顧客名で候補を検索
            <input
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!storeId || searching}
            onClick={() =>
              startSearch(async () => {
                const result = await searchPurchaseCustomers(storeId, search);
                setCustomerOptions((previous) => {
                  const selected = previous.find((c) => c.id === customerId);
                  return selected &&
                    !result.customers.some((c) => c.id === selected.id)
                    ? [selected, ...result.customers]
                    : result.customers;
                });
                setSearchMessage(result.message);
              })
            }
          >
            {searching ? "検索中…" : "顧客候補を検索"}
          </button>
        </div>
        {searchMessage && (
          <p role="status" className="muted small">
            {searchMessage}
          </p>
        )}
        <div className="lookup-panel">
          <label>
            原本ファイル名で候補を検索
            <input
              maxLength={100}
              value={importSearch}
              onChange={(e) => setImportSearch(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!storeId || searching}
            onClick={() =>
              startSearch(async () => {
                const result = await searchPurchaseImports(
                  storeId,
                  importSearch,
                );
                setImportOptions((previous) => {
                  const selected = previous.find((d) => d.id === sourceId);
                  return selected &&
                    !result.documents.some((d) => d.id === selected.id)
                    ? [selected, ...result.documents]
                    : result.documents;
                });
                setImportMessage(result.message);
              })
            }
          >
            原本候補を検索
          </button>
        </div>
        {importMessage && (
          <p role="status" className="muted small">
            {importMessage}
          </p>
        )}
      </section>
      <section className="card">
        <div className="page-heading">
          <h2>商品明細</h2>
          <button
            type="button"
            className="secondary"
            disabled={lines.length >= 200}
            onClick={() => setLines((v) => [...v, draft()])}
          >
            明細行を追加
          </button>
        </div>
        {!lines.length && (
          <p className="muted">
            商品明細はありません。不成約を含め、明細なしでも来店取引を登録できます。
          </p>
        )}
        {lines.map((line, index) => (
          <fieldset key={line.id ?? `new-${index}`} className="item-editor">
            <legend>明細 {index + 1}</legend>
            <div className="form-grid">
              <label>
                商品名<span className="required"> 必須</span>
                <input
                  required
                  maxLength={500}
                  value={line.item_name}
                  onChange={(e) =>
                    changeItem(index, "item_name", e.target.value)
                  }
                />
                {line.raw_item_name && (
                  <span className="muted small">
                    AI原読取：{line.raw_item_name}
                  </span>
                )}
              </label>
              <label>
                商品カテゴリ
                <select
                  aria-label="商品カテゴリ"
                  value={line.product_category_id}
                  onChange={(e) => {
                    changeItem(index, "product_category_id", e.target.value);
                    changeItem(index, "category_reviewed", false);
                  }}
                >
                  <option value="">未分類</option>
                  {categories
                    .filter(
                      (c) => c.is_active || c.id === line.product_category_id,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {"　".repeat(Math.min(10, c.category_level - 1))}
                        {c.category_name}
                        {!c.is_active ? "（無効）" : ""}
                      </option>
                    ))}
                </select>
                {line.category_confidence !== null && (
                  <span className="muted small">
                    AI候補の信頼度：{Math.round(line.category_confidence * 100)}
                    %
                  </span>
                )}
              </label>
              <label>
                グラム / 額面
                <input
                  maxLength={100}
                  value={line.denomination_or_weight}
                  onChange={(e) =>
                    changeItem(index, "denomination_or_weight", e.target.value)
                  }
                />
              </label>
              <label>
                数量
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.quantity}
                  onChange={(e) =>
                    changeItem(index, "quantity", e.target.value)
                  }
                />
              </label>
              <label>
                買取額
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.purchase_amount}
                  onChange={(e) =>
                    changeItem(index, "purchase_amount", e.target.value)
                  }
                />
              </label>
              <label>
                明細備考
                <input
                  maxLength={1000}
                  value={line.notes}
                  onChange={(e) => changeItem(index, "notes", e.target.value)}
                />
              </label>
            </div>
            <div className="inline-actions">
              <label className="check">
                <input
                  type="checkbox"
                  checked={line.category_reviewed}
                  onChange={(e) =>
                    changeItem(index, "category_reviewed", e.target.checked)
                  }
                />
                カテゴリを確認済み
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => setLines((v) => v.filter((_, i) => i !== index))}
              >
                この明細行を削除
              </button>
            </div>
          </fieldset>
        ))}
        <p className="muted">
          明細 {lines.length}行 ／ 明細買取額合計{" "}
          {subtotal.toLocaleString("ja-JP")}円
        </p>
        {values.purchase_total !== "" &&
          Math.abs(Number(values.purchase_total) - subtotal) > 0.005 && (
            <p className="notice warning">
              明細の金額合計と買取合計金額が異なります。原本を確認してください。入力値は自動で書き換えません。
            </p>
          )}
        <p className="muted small">
          点数は明細行数・数量から自動確定しません。原本の点数を入力してください。行の削除は「取引と明細を保存」を押したときに反映されます。
        </p>
      </section>
      <Feedback state={state} />
      <div>
        <button disabled={pending}>
          {pending ? "保存中…" : "取引と明細を保存"}
        </button>
      </div>
    </form>
  );
}
