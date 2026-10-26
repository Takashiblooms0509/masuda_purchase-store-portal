"use client";
import { useActionState, useRef, useState } from "react";
import type { Store } from "@/types/database";
import { CustomerForm } from "@/app/(portal)/customers/forms";
import {
  previewCustomerImport,
  confirmCustomerImport,
  type ImportCustomerRow,
} from "@/app/(portal)/customers/csv-actions";
import { Feedback } from "@/components/business-ui";
function Confirmation({
  rows,
  request,
}: {
  rows: ImportCustomerRow[];
  request: string;
}) {
  const [included, setIncluded] = useState(
    () => new Set(rows.filter((r) => !r.candidates.length).map((r) => r.line)),
  );
  const [state, action, pending] = useActionState(confirmCustomerImport, {
    message: "",
  });
  const payload = rows
    .filter((r) => included.has(r.line))
    .map((r) => ({
      store_id: r.store_id,
      name: r.name,
      name_kana: r.name_kana,
      phone: r.phone,
      membership_card_number: r.membership_card_number,
      approved_duplicate_ids: r.candidates.map((c) => c.id),
    }));
  return (
    <form action={action}>
      <input type="hidden" name="request" value={request} />
      <input type="hidden" name="rows" value={JSON.stringify(payload)} />
      <fieldset disabled={pending || state.success}>
        <legend>取込プレビュー（追加のみ）</legend>
        {rows.map((r) => (
          <div className="customer-transaction" key={r.line}>
            <label className="check">
              <input
                type="checkbox"
                checked={included.has(r.line)}
                onChange={(e) => {
                  const next = new Set(included);
                  if (e.target.checked) next.add(r.line);
                  else next.delete(r.line);
                  setIncluded(next);
                }}
              />
              {r.line}行目：{r.name} / {r.store_name}
            </label>
            <p className="small">
              {r.phone || "電話未登録"} /{" "}
              {r.membership_card_number || "カード未登録"}
            </p>
            {r.candidates.length > 0 && (
              <p className="notice">
                重複候補：{r.candidates.map((c) => c.name).join("、")}
                。追加する場合は候補とは別人であることを確認してください。
              </p>
            )}
          </div>
        ))}
        <label className="check">
          <input name="confirmed" type="checkbox" required />
          選択した{payload.length}
          件を新規追加します。既存顧客の上書きはしません。
        </label>
        <button disabled={!payload.length}>確認して一括登録</button>
      </fieldset>
      <Feedback state={state} />
    </form>
  );
}
function CsvImport() {
  const [state, action, pending] = useActionState(previewCustomerImport, {
    message: "",
  });
  const [revision, setRevision] = useState(0),
    [submitted, setSubmitted] = useState(-1);
  return (
    <>
      <p>UTF-8 / 32KB / 最大20行。新規追加のみです。</p>
      <a className="text-link" href="/customers/template" download>
        日本語CSVテンプレートをダウンロード
      </a>
      <p className="muted small">
        登録店舗コード・氏名・フリガナ・電話番号・リピーターズカード番号。本人確認番号、住所、生年月日、メモは含みません。スタッフは自店舗のコードのみ使用できます。
      </p>
      <form action={action} onSubmit={() => setSubmitted(revision)}>
        <label>
          CSVファイル
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            disabled={pending}
            onChange={() => setRevision(revision + 1)}
          />
        </label>
        <button disabled={pending}>プレビューと検証</button>
      </form>
      <Feedback state={state} />
      {state.rows && state.request && submitted === revision && (
        <Confirmation
          key={state.request}
          rows={state.rows}
          request={state.request}
        />
      )}
    </>
  );
}
export function CustomerAdd({
  stores,
  actorKey,
}: {
  stores: Store[];
  actorKey: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<"choice" | "direct" | "csv">("choice"),
    [generation, setGeneration] = useState(0);
  function close() {
    dialog.current?.close();
    setMode("choice");
    setGeneration((g) => g + 1);
    button.current?.focus();
  }
  return (
    <>
      <button
        ref={button}
        onClick={() => {
          setMode("choice");
          dialog.current?.showModal();
        }}
      >
        顧客を追加
      </button>
      <dialog
        className="customer-dialog"
        ref={dialog}
        onCancel={close}
        onClose={() => button.current?.focus()}
        aria-labelledby="customer-add-title"
      >
        <header>
          <h2 id="customer-add-title">
            {mode === "direct"
              ? "直接入力"
              : mode === "csv"
                ? "CSVから追加"
                : "顧客を追加"}
          </h2>
          <button
            className="secondary"
            type="button"
            onClick={close}
            aria-label="追加画面を閉じる"
          >
            閉じる
          </button>
        </header>
        <div
          className="customer-dialog-body"
          key={`${actorKey}:${generation}:${mode}`}
        >
          {mode === "choice" ? (
            <>
              <p>日常の登録は直接入力、まとめて登録する場合はCSVを選びます。</p>
              <div className="inline-actions">
                <button onClick={() => setMode("direct")}>直接入力</button>
                <button className="secondary" onClick={() => setMode("csv")}>
                  CSVから追加
                </button>
              </div>
            </>
          ) : mode === "direct" ? (
            <CustomerForm stores={stores} />
          ) : (
            <CsvImport />
          )}
        </div>
      </dialog>
    </>
  );
}
