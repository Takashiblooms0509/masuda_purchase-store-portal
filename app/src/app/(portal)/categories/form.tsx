"use client";
import { useActionState } from "react";
import { saveCategory } from "./actions";
import { Feedback } from "@/components/business-ui";
import type { ProductCategory } from "@/types/database";
export function CategoryForm({
  category,
  categories,
}: {
  category?: ProductCategory;
  categories: ProductCategory[];
}) {
  const [state, action, pending] = useActionState(saveCategory, {
    message: "",
  });
  return (
    <form
      onReset={(event) => event.preventDefault()}
      action={action}
      className="stack"
    >
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <div className="form-grid">
        <label>
          カテゴリ名
          <input
            name="category_name"
            required
            maxLength={100}
            defaultValue={category?.category_name}
          />
        </label>
        <label>
          親カテゴリ
          <select
            aria-label="親カテゴリ"
            name="parent_category_id"
            defaultValue={category?.parent_category_id ?? ""}
          >
            <option value="">親なし（第1階層）</option>
            {categories
              .filter((c) => c.id !== category?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.category_name}（第{c.category_level}階層）
                </option>
              ))}
          </select>
        </label>
        <label>
          表示順
          <input
            name="display_order"
            type="number"
            step="1"
            defaultValue={category?.display_order ?? 0}
          />
        </label>
      </div>
      <label className="check">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={category?.is_active ?? true}
        />
        有効なカテゴリ
      </label>
      <Feedback state={state} />
      <div>
        <button disabled={pending}>
          {category ? "変更を保存" : "カテゴリを登録"}
        </button>
      </div>
    </form>
  );
}
