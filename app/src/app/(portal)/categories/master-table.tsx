"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductCategory } from "@/types/database";
import { saveCategory } from "./actions";
import { CategoryCsvPanel } from "./csv-panel";
import styles from "./master.module.css";
type Draft = {
  original?: ProductCategory;
  parent: string;
  anchor: string;
  name: string;
  active: boolean;
  kind: "parent" | "child";
};
const emptyFilter = { parent: "", state: "", query: "" };
export function CategoryMaster({
  categories,
  admin,
}: {
  categories: ProductCategory[];
  admin: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(emptyFilter),
    [applied, setApplied] = useState(emptyFilter);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const nameInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    returnFocus = useRef<HTMLElement | null>(null),
    filterSelect = useRef<HTMLSelectElement>(null),
    busy = useRef(false);
  const roots = categories.filter((c) => !c.parent_category_id);
  const children = (id: string) =>
    categories.filter((c) => c.parent_category_id === id);
  const malformed = categories.some(
    (c) =>
      c.parent_category_id && !roots.some((p) => p.id === c.parent_category_id),
  );
  const editingKind = draft?.kind;
  useEffect(() => {
    if (!editingKind) return;
    if (editingKind === "parent") dialog.current?.showModal();
    nameInput.current?.focus();
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a[href]") &&
        (busy.current ||
          !window.confirm("未保存の変更があります。画面を離れますか？"))
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", navigate, true);
    };
  }, [editingKind]);
  function start(kind: Draft["kind"], parent = "", original?: ProductCategory) {
    if (!admin || draft || busy.current || malformed) return;
    returnFocus.current = document.activeElement as HTMLElement;
    setError("");
    setMessage("");
    setDraft({
      kind,
      anchor: parent,
      original: original ? { ...original } : undefined,
      parent: original?.parent_category_id ?? parent,
      name: original?.category_name ?? "",
      active:
        original?.is_active ??
        (parent
          ? (roots.find((p) => p.id === parent)?.is_active ?? true)
          : true),
    });
  }
  function close() {
    if (busy.current) return;
    dialog.current?.close();
    setDraft(null);
    setError("");
    requestAnimationFrame(() =>
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : filterSelect.current
      )?.focus(),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !admin || busy.current) return;
    const name = draft.name.trim();
    if (!name) {
      setError("カテゴリ名を入力してください。");
      return;
    }
    if (
      categories.some(
        (c) =>
          c.id !== draft.original?.id &&
          (c.parent_category_id ?? "") === draft.parent &&
          c.category_name.trim() === name,
      )
    ) {
      setError(
        "同じ親の下に同名カテゴリがあります（無効カテゴリも含みます）。",
      );
      return;
    }
    if (
      draft.active &&
      draft.parent &&
      !roots.find((c) => c.id === draft.parent)?.is_active
    ) {
      setError("有効な子には有効な親を指定してください。");
      return;
    }
    if (
      !draft.active &&
      draft.original &&
      children(draft.original.id).some((c) => c.is_active)
    ) {
      setError(
        "有効な子が残る親は無効化できません。先に子を移動または無効化してください。",
      );
      return;
    }
    const form = new FormData();
    form.set("id", draft.original?.id ?? "");
    form.set("updated_at", draft.original?.updated_at ?? "");
    form.set("category_name", name);
    form.set("parent_category_id", draft.parent);
    form.set("display_order", String(draft.original?.display_order ?? 0));
    if (draft.active) form.set("is_active", "on");
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await saveCategory({ message: "" }, form);
      if (result.success) {
        busy.current = false;
        close();
        setMessage("カテゴリを保存しました。");
        router.refresh();
      } else setError(result.message);
    } catch {
      setError(
        "保存結果を確認できません。入力内容を控え、再送せず一覧を再読み込みしてください。",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function editor() {
    return (
      draft && (
        <form
          onSubmit={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
        >
          <div className={styles.editor}>
            {draft.kind === "child" && (
              <label>
                親カテゴリ
                <select
                  aria-label="親カテゴリ"
                  disabled={pending}
                  value={draft.parent}
                  onChange={(e) =>
                    setDraft({ ...draft, parent: e.target.value })
                  }
                >
                  {roots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.category_name}
                      {p.is_active ? "" : "（無効）"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {draft.kind === "parent" ? "親カテゴリ名" : "子カテゴリ名"}
              <input
                ref={nameInput}
                required
                maxLength={100}
                disabled={pending}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              状態
              <select
                aria-label="状態"
                disabled={pending}
                value={draft.active ? "active" : "inactive"}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.value === "active" })
                }
              >
                <option value="active">有効</option>
                <option value="inactive">無効</option>
              </select>
            </label>
            <div className={styles.buttons}>
              <button disabled={pending}>{pending ? "保存中…" : "保存"}</button>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={close}
              >
                キャンセル
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </form>
      )
    );
  }
  const groupRows = roots.map((parent) => {
    if (applied.parent && parent.id !== applied.parent) return null;
    const all = children(parent.id);
    const matches = all.filter(
      (c) =>
        (!applied.state ||
          (c.is_active ? "active" : "inactive") === applied.state) &&
        `${parent.category_name} ${c.category_name}`
          .toLocaleLowerCase()
          .includes(applied.query.toLocaleLowerCase()),
    );
    // Keep a new child's editor anchored to its original group while choosing another parent.
    const adding =
      draft?.kind === "child" && !draft.original && draft.anchor === parent.id;
    const empty =
      !all.length &&
      !applied.state &&
      parent.category_name
        .toLocaleLowerCase()
        .includes(applied.query.toLocaleLowerCase());
    if (!matches.length && !empty && !adding) return null;
    const parentCell = (
      <div className={styles.parent}>
        <strong>{parent.category_name}</strong>
        {!parent.is_active && <span className="badge inactive">親：無効</span>}
        {admin && (
          <button
            type="button"
            className="secondary"
            disabled={!!draft || malformed}
            onClick={() => start("parent", "", parent)}
          >
            親を編集
          </button>
        )}
      </div>
    );
    const editorRow = (
      <tr className={styles.editing}>
        <td colSpan={4}>{editor()}</td>
      </tr>
    );
    return (
      <Fragment key={parent.id}>
        {!matches.length && (
          <tr>
            <td>{parentCell}</td>
            <td colSpan={3} className="muted">
              子カテゴリはまだありません。
            </td>
          </tr>
        )}
        {matches.map((child, index) =>
          draft?.original?.id === child.id ? (
            <Fragment key={child.id}>{editorRow}</Fragment>
          ) : (
            <tr key={child.id}>
              <td>
                {index === 0 ? (
                  parentCell
                ) : (
                  <span className="muted">{parent.category_name}</span>
                )}
              </td>
              <td>{child.category_name}</td>
              <td>
                <span className={`badge ${child.is_active ? "" : "inactive"}`}>
                  {child.is_active ? "有効" : "無効"}
                </span>
              </td>
              <td>
                {admin ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={!!draft || malformed}
                    onClick={() => start("child", parent.id, child)}
                  >
                    編集
                  </button>
                ) : (
                  <span className="muted">閲覧のみ</span>
                )}
              </td>
            </tr>
          ),
        )}
        {adding && editorRow}
        {admin && (
          <tr className={styles.add}>
            <td colSpan={4}>
              <button
                type="button"
                className="secondary"
                disabled={!!draft || malformed}
                onClick={() => start("child", parent.id)}
              >
                ＋ {parent.category_name}に子を追加
              </button>
            </td>
          </tr>
        )}
      </Fragment>
    );
  });
  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>商品カテゴリ</h1>
          <p className="muted">親と子を一緒に見ながら、その場で編集。</p>
        </div>
        {admin && (
          <button
            disabled={!!draft || malformed}
            onClick={() => start("parent")}
          >
            親カテゴリを追加
          </button>
        )}
      </div>
      {malformed && (
        <p role="alert" className="notice error">
          2階層を超えるカテゴリ、または親参照の不整合があります。自動変更せず編集を停止しています。管理者による確認が必要です。
        </p>
      )}
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft) setApplied({ ...filter, query: filter.query.trim() });
        }}
      >
        <label>
          親カテゴリ
          <select
            aria-label="親カテゴリ"
            ref={filterSelect}
            disabled={!!draft}
            value={filter.parent}
            onChange={(e) => setFilter({ ...filter, parent: e.target.value })}
          >
            <option value="">すべての親カテゴリ</option>
            {roots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.category_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          子の状態
          <select
            disabled={!!draft}
            aria-label="子の状態"
            value={filter.state}
            onChange={(e) => setFilter({ ...filter, state: e.target.value })}
          >
            <option value="">すべて</option>
            <option value="active">有効</option>
            <option value="inactive">無効</option>
          </select>
        </label>
        <label>
          カテゴリ名
          <input
            disabled={!!draft}
            maxLength={100}
            placeholder="親・子の名前で検索"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
        </label>
        <button disabled={!!draft}>検索</button>
        <button
          type="button"
          className="secondary"
          disabled={!!draft}
          onClick={() => {
            setFilter(emptyFilter);
            setApplied(emptyFilter);
          }}
        >
          解除
        </button>
      </form>
      <p className={styles.status} role="status">
        {message ||
          (draft
            ? "編集中 · 保存またはキャンセルしてください。"
            : admin
              ? "編集 → 保存で反映。親の変更は「親を編集」から。"
              : "閲覧専用です。変更は管理者に依頼してください。")}
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="商品カテゴリの編集表"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th>親カテゴリ</th>
              <th>子カテゴリ</th>
              <th>子の状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {groupRows.some(Boolean) ? (
              groupRows
            ) : (
              <tr>
                <td colSpan={4}>条件に一致するカテゴリはありません。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.status}>
        狭い画面では表を左右にスクロールできます。使用済みカテゴリは削除せず無効化し、履歴を保持します。
      </p>
      {admin && (
        <details className={styles.csv} inert={!!draft || malformed}>
          <summary>補助機能：CSV出力・取込</summary>
          <CategoryCsvPanel />
        </details>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="parent-editor-title"
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const nodes = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
            ),
          );
          if (!nodes.length) {
            e.preventDefault();
            return;
          }
          if (e.shiftKey && document.activeElement === nodes[0]) {
            e.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
            e.preventDefault();
            nodes[0].focus();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        {draft?.kind === "parent" && (
          <>
            <h2 id="parent-editor-title">
              {draft.original ? "親カテゴリを編集" : "親カテゴリを追加"}
            </h2>
            <p className="muted">
              {draft.original
                ? `名称変更は所属する子 ${children(draft.original.id).length}件すべてに反映します。`
                : "親を1件追加します。子は追加後に登録できます。"}
            </p>
            {editor()}
          </>
        )}
      </dialog>
    </>
  );
}
