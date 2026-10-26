"use client";
import { startTransition, useActionState, useState } from "react";
import {
  previewCategoryImport,
  confirmCategoryImport,
  type ImportPreviewState,
} from "./actions";
import { categoryCsv, type CsvPreview } from "@/lib/categories/csv";
import { Feedback } from "@/components/business-ui";
export function CategoryCsvPanel() {
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [previewState, previewAction, previewPending] = useActionState<
    ImportPreviewState,
    FormData
  >(
    async (previous, form) => {
      setPreview(null);
      setConfirmed(false);
      const result = await previewCategoryImport(previous, form);
      setPreview(result.preview ?? null);
      return result;
    },
    { message: "" },
  );
  const [saveState, saveAction, savePending] = useActionState(
    async (
      previous: { message: string; success?: boolean },
      form: FormData,
    ) => {
      const result = await confirmCategoryImport(previous, form);
      // Re-preview after every attempt, including uncertain network results, before resubmission.
      setPreview(null);
      setConfirmed(false);
      return result;
    },
    { message: "" },
  );
  const pending = previewPending || savePending;
  return (
    <section className="card stack">
      <h2>カテゴリCSV</h2>
      <p className="muted">
        CSVは管理者のみ利用できます。UTF-8（BOMあり／なし）、256KB・500行まで。未記載のカテゴリは変更しません。テーブルの未保存編集は出力や取込に含みません。
      </p>
      <div className="category-buttons">
        <a href="/categories/export" className="button secondary">
          保存済みカテゴリをCSV出力
        </a>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(categoryCsv([]))}`}
          download="categories-template.csv"
          className="button secondary"
        >
          空テンプレート
        </a>
      </div>
      <details>
        <summary>列と新規親子の指定方法</summary>
        <p>
          更新はidとupdated_atをそのまま残します。追加はid・updated_atを空欄にし、new_keyに英字から始まる一意のキー（英数字・_・-、64文字まで）を入力します。
        </p>
        <p>
          親が既存ならparent_idにUUID、新規ならparent_new_keyに親行のnew_keyを指定します。両方の指定はできません。親なしは両方空欄です。例：親のnew_keyをmetal、子のparent_new_keyをmetalにすると同時追加できます。
        </p>
        <p>
          category_nameは必須、display_orderは整数、is_activeはtrueまたはfalseです。同じ親の下の同名（前後空白を除く）は無効行も含めて禁止。有効な子を残した親の無効化はできません。親子の無効化や移動はCSVでまとめて指定できます。
        </p>
        <p>
          出力では表計算ソフトの式を防ぐため、=・+・-・@・制御文字・アポストロフィで始まるセルにアポストロフィを付加します。取込時にこのエスケープを復元します。列名・順序は変更しないでください。出力が500行／256KBを超える場合、ヘッダーを保持して分割し、親参照の依存を確認してください。
        </p>
      </details>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => previewAction(data));
        }}
      >
        <label>
          CSVファイル
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            disabled={pending}
            onChange={() => {
              setPreview(null);
              setConfirmed(false);
            }}
          />
        </label>
        <div>
          <button disabled={pending}>
            {previewPending ? "検証中…" : "取込内容をプレビュー"}
          </button>
        </div>
      </form>
      <Feedback state={previewState} />
      <Feedback state={saveState} />
      {preview && (
        <>
          <h3>
            取込前確認：追加{" "}
            {preview.changes.filter((c) => c.kind === "追加").length}行 / 更新{" "}
            {preview.changes.filter((c) => c.kind === "更新").length}行
          </h3>
          {!!preview.errors.length && (
            <div className="notice error" role="alert">
              <strong>エラーがあるため保存できません（最大100件表示）</strong>
              <ul>
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div
            className="table-scroll"
            role="region"
            aria-label="CSV変更プレビュー"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>CSV行</th>
                  <th>操作</th>
                  <th>変更前</th>
                  <th>変更後</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((c) => (
                  <tr key={c.line}>
                    <td>{c.line}</td>
                    <td>{c.kind}</td>
                    <td>{c.before}</td>
                    <td>{c.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!preview.errors.length && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                startTransition(() => saveAction(data));
              }}
            >
              <input
                type="hidden"
                name="rows"
                value={JSON.stringify(preview.rows)}
              />
              <label className="check">
                <input
                  name="confirmed"
                  type="checkbox"
                  required
                  checked={confirmed}
                  disabled={pending}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                変更内容を確認しました。全行を一括保存します。
              </label>
              <div>
                <button disabled={pending || !confirmed}>
                  {savePending ? "保存中…" : "確認した全行を保存"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
