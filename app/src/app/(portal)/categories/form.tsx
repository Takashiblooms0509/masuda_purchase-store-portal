"use client";
import { startTransition, useActionState, useId, useState } from "react";
import { saveCategory, type CategoryState } from "./actions";
import { Feedback } from "@/components/business-ui";
import { categoryParents, categoryPath } from "@/lib/categories/tree";
import type { ProductCategory } from "@/types/database";

function fields(category?: ProductCategory) {
  return {
    category_name: category?.category_name ?? "",
    parent_category_id: category?.parent_category_id ?? "",
    display_order: String(category?.display_order ?? 0),
    is_active: category?.is_active ?? true,
  };
}
export function CategoryRow({
  category,
  categories,
}: {
  category?: ProductCategory;
  categories: ProductCategory[];
}) {
  const formId = useId();
  const [draft, setDraft] = useState(() => fields(category));
  const [saved, setSaved] = useState(() => fields(category));
  const [revision, setRevision] = useState(category?.updated_at ?? "");
  const [state, action, pending] = useActionState<CategoryState, FormData>(
    async (previous, form) => {
      const result = await saveCategory(previous, form);
      if (result.success) {
        const next = category
          ? {
              category_name: String(form.get("category_name") ?? "").trim(),
              parent_category_id: String(form.get("parent_category_id") ?? ""),
              display_order: String(form.get("display_order") ?? "0"),
              is_active: form.get("is_active") === "on",
            }
          : fields();
        setDraft(next);
        setSaved(next);
        setRevision(result.updatedAt ?? "");
      }
      return result;
    },
    { message: "" },
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const label = category?.category_name ?? "新規カテゴリ";
  const parents = categoryParents(categories, category?.id);
  const hasChildren =
    category && categories.some((c) => c.parent_category_id === category.id);
  return (
    <tr className={dirty ? "category-dirty" : undefined} aria-label={label}>
      <td>
        <input
          form={formId}
          name="category_name"
          aria-label={`${label}のカテゴリ名`}
          required
          maxLength={100}
          value={draft.category_name}
          disabled={pending}
          onChange={(e) =>
            setDraft({ ...draft, category_name: e.target.value })
          }
        />
        <small>
          {category ? `第${category.category_level}階層` : "新規追加"}
          {dirty ? " · 未保存" : ""}
        </small>
      </td>
      <td>
        <select
          form={formId}
          name="parent_category_id"
          aria-label={`${label}の親カテゴリ`}
          value={draft.parent_category_id}
          disabled={pending}
          onChange={(e) =>
            setDraft({ ...draft, parent_category_id: e.target.value })
          }
        >
          <option value="">親なし（第1階層）</option>
          {parents.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryPath(c, categories)}
              {c.is_active ? "" : "（無効）"}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          form={formId}
          name="display_order"
          aria-label={`${label}の表示順`}
          type="number"
          required
          min={-2147483648}
          max={2147483647}
          step={1}
          value={draft.display_order}
          disabled={pending}
          onChange={(e) =>
            setDraft({ ...draft, display_order: e.target.value })
          }
        />
      </td>
      <td>
        <label className="check">
          <input
            form={formId}
            name="is_active"
            type="checkbox"
            checked={draft.is_active}
            disabled={pending}
            onChange={(e) =>
              setDraft({ ...draft, is_active: e.target.checked })
            }
            aria-label={`${label}を有効にする`}
          />
          {draft.is_active ? "有効" : "無効"}
        </label>
        {hasChildren && <small>子カテゴリは連動しません</small>}
      </td>
      <td>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(() => action(form));
          }}
          onReset={(e) => e.preventDefault()}
        >
          <input type="hidden" name="id" value={category?.id ?? ""} />
          <input type="hidden" name="updated_at" value={revision} />
          <div className="category-buttons">
            <button disabled={pending || !dirty}>
              {pending ? "保存中…" : category ? "保存" : "追加"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending || !dirty}
              onClick={() => {
                setDraft(saved);
              }}
            >
              変更を戻す
            </button>
          </div>
          <Feedback state={state.success && dirty ? { message: "" } : state} />
        </form>
      </td>
    </tr>
  );
}
