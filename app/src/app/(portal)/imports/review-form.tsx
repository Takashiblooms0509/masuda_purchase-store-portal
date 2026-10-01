"use client";
import { useActionState, useState } from "react";
import { saveReview } from "./review-actions";
import { Feedback } from "@/components/business-ui";
import { toLocalInput, toVisitIso } from "@/lib/business/format";
import type { ReviewResult } from "@/lib/ai/schemas";
const customerFields = [
  ["name", "氏名", 100],
  ["name_kana", "フリガナ", 100],
  ["occupation", "職業", 100],
  ["address", "住所", 500],
  ["phone", "電話番号", 50],
  ["membership_card_number", "メンバーズカード番号", 100],
] as const;
const transactionFields = [
  ["purchase_staff_name", "買取担当者", 100],
  ["payment_staff_name", "支払担当者", 100],
  ["visit_source", "来店経路", 100],
  ["visit_source_detail", "来店経路の詳細", 500],
] as const;
export function ReviewForm({
  id,
  updatedAt,
  initial,
}: {
  id: string;
  updatedAt: string;
  initial: ReviewResult;
}) {
  const [review, setReview] = useState(initial);
  const [state, action, pending] = useActionState(saveReview, { message: "" });
  const changeCustomer = <K extends keyof ReviewResult["customer"]>(
    key: K,
    value: ReviewResult["customer"][K],
  ) =>
    setReview((previous) => ({
      ...previous,
      customer: { ...previous.customer, [key]: value },
    }));
  const changeTransaction = <K extends keyof ReviewResult["transaction"]>(
    key: K,
    value: ReviewResult["transaction"][K],
  ) =>
    setReview((previous) => ({
      ...previous,
      transaction: { ...previous.transaction, [key]: value },
    }));
  const changeItem = <K extends keyof ReviewResult["items"][number]>(
    index: number,
    key: K,
    value: ReviewResult["items"][number][K],
  ) =>
    setReview((previous) => ({
      ...previous,
      items: previous.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  const number = (value: string) => (value === "" ? null : Number(value));
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="stack review-form"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="updated_at" value={updatedAt} />
      <input type="hidden" name="review" value={JSON.stringify(review)} />
      <fieldset disabled={pending} className="card">
        <h2>帳票・顧客情報</h2>
        <div className="form-grid">
          <label>
            計算書番号
            <input
              value={review.document_number ?? ""}
              maxLength={100}
              onChange={(event) =>
                setReview({
                  ...review,
                  document_number: event.target.value || null,
                })
              }
            />
          </label>
          <label>
            帳票の店舗名
            <input
              value={review.store_name ?? ""}
              maxLength={100}
              onChange={(event) =>
                setReview({ ...review, store_name: event.target.value || null })
              }
            />
          </label>
          {customerFields.map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                maxLength={max}
                value={review.customer[key] ?? ""}
                onChange={(event) =>
                  changeCustomer(key, event.target.value || null)
                }
              />
            </label>
          ))}
          <label>
            生年月日
            <input
              type="date"
              value={review.customer.birth_date ?? ""}
              onChange={(event) =>
                changeCustomer("birth_date", event.target.value || null)
              }
            />
          </label>
          <label>
            DM可否
            <select
              aria-label="DM可否"
              value={
                review.customer.dm_allowed === null
                  ? ""
                  : String(review.customer.dm_allowed)
              }
              onChange={(event) =>
                changeCustomer(
                  "dm_allowed",
                  event.target.value === ""
                    ? null
                    : event.target.value === "true",
                )
              }
            >
              <option value="">不明・未入力</option>
              <option value="true">可</option>
              <option value="false">不可</option>
            </select>
          </label>
        </div>
        <p className="muted small">
          メンバーズカード番号は来店回数ではありません。原本を確認して入力してください。
        </p>
      </fieldset>
      <fieldset disabled={pending} className="card">
        <h2>来店・取引情報</h2>
        <div className="form-grid">
          <label>
            来店日時（日本時間）
            <input
              type="datetime-local"
              value={toLocalInput(review.transaction.visit_datetime)}
              onChange={(event) =>
                changeTransaction(
                  "visit_datetime",
                  toVisitIso(event.target.value) || null,
                )
              }
            />
          </label>
          <label>
            成約 / 不成約
            <select
              aria-label="成約 / 不成約"
              value={review.transaction.transaction_status ?? ""}
              onChange={(event) =>
                changeTransaction(
                  "transaction_status",
                  event.target.value === ""
                    ? null
                    : (event.target.value as "completed" | "not_completed"),
                )
              }
            >
              <option value="">未確認</option>
              <option value="completed">成約</option>
              <option value="not_completed">不成約</option>
            </select>
          </label>
          {transactionFields.map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                maxLength={max}
                value={review.transaction[key] ?? ""}
                onChange={(event) =>
                  changeTransaction(key, event.target.value || null)
                }
              />
            </label>
          ))}
          <label>
            買取点数
            <input
              type="number"
              min={0}
              max={2147483647}
              step={1}
              value={review.transaction.purchase_item_count ?? ""}
              onChange={(event) =>
                changeTransaction(
                  "purchase_item_count",
                  number(event.target.value),
                )
              }
            />
          </label>
          <label>
            買取合計金額
            <input
              type="number"
              min={0}
              max={999999999999.99}
              step="any"
              value={review.transaction.purchase_total ?? ""}
              onChange={(event) =>
                changeTransaction("purchase_total", number(event.target.value))
              }
            />
          </label>
        </div>
        <p className="muted small">
          「不」の単独記載は自動判定していません。点数・合計金額は原本と照合してください。
        </p>
      </fieldset>
      <fieldset disabled={pending} className="card">
        <div className="page-heading">
          <h2>商品明細</h2>
          <button
            className="secondary"
            type="button"
            disabled={pending || review.items.length >= 200}
            onClick={() =>
              setReview({
                ...review,
                items: [
                  ...review.items,
                  {
                    source_line_index: null,
                    raw_item_name: null,
                    item_name: null,
                    denomination_or_weight: null,
                    quantity: null,
                    purchase_amount: null,
                    notes: null,
                  },
                ],
              })
            }
          >
            明細行を追加
          </button>
        </div>
        {review.items.map((item, index) => (
          <fieldset
            className="item-editor"
            key={`${index}-${item.source_line_index ?? "manual"}`}
          >
            <legend>明細 {index + 1}</legend>
            <p className="muted small">
              原読取の商品名：{item.raw_item_name ?? "未読取・手動追加"}
            </p>
            <div className="form-grid">
              <label>
                商品名
                <input
                  value={item.item_name ?? ""}
                  maxLength={500}
                  onChange={(event) =>
                    changeItem(index, "item_name", event.target.value || null)
                  }
                />
              </label>
              <label>
                グラム / 額面
                <input
                  value={item.denomination_or_weight ?? ""}
                  maxLength={100}
                  onChange={(event) =>
                    changeItem(
                      index,
                      "denomination_or_weight",
                      event.target.value || null,
                    )
                  }
                />
              </label>
              <label>
                数量
                <input
                  type="number"
                  min={0}
                  max={999999999.999}
                  step="any"
                  value={item.quantity ?? ""}
                  onChange={(event) =>
                    changeItem(index, "quantity", number(event.target.value))
                  }
                />
              </label>
              <label>
                買取額
                <input
                  type="number"
                  min={0}
                  max={999999999999.99}
                  step="any"
                  value={item.purchase_amount ?? ""}
                  onChange={(event) =>
                    changeItem(
                      index,
                      "purchase_amount",
                      number(event.target.value),
                    )
                  }
                />
              </label>
              <label className="wide">
                明細備考
                <input
                  value={item.notes ?? ""}
                  maxLength={1000}
                  onChange={(event) =>
                    changeItem(index, "notes", event.target.value || null)
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setReview({
                  ...review,
                  items: review.items.filter((_, i) => i !== index),
                })
              }
            >
              この明細行を削除
            </button>
          </fieldset>
        ))}
        {!review.items.length && (
          <p className="muted">
            読取明細はありません。必要に応じて追加してください。
          </p>
        )}
        <label>
          備考
          <textarea
            rows={3}
            value={review.notes ?? ""}
            maxLength={2000}
            onChange={(event) =>
              setReview({ ...review, notes: event.target.value || null })
            }
          />
        </label>
      </fieldset>
      <Feedback state={state} />
      <p className="notice warning">
        この操作は確認内容の保存です。顧客・取引の確定登録機能は準備中です。
      </p>
      <button disabled={pending}>
        {pending ? "保存中…" : "確認内容を保存"}
      </button>
    </form>
  );
}
