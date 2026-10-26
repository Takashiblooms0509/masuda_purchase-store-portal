import { requireProfile } from "@/lib/auth/session";
import { PageTitle } from "@/components/business-ui";
import { CategoryRow } from "./form";
import { CategoryCsvPanel } from "./csv-panel";
import { readCategories } from "@/lib/categories/read";
import { categoryOrder, categoryPath } from "@/lib/categories/tree";
export default async function CategoriesPage() {
  const { supabase, profile } = await requireProfile();
  const categories = await readCategories(supabase);
  const admin = profile.role === "admin";
  return (
    <>
      <PageTitle
        title="商品カテゴリ管理"
        description="カテゴリの親子関係・表示順・有効状態を管理します。"
      />
      <section className="card">
        <h2>
          カテゴリ一覧 <span className="muted">{categories.length}件</span>
        </h2>
        <p id="category-help" className="muted">
          {admin
            ? "編集後、行ごとに「保存」してください。画面を離れると未保存の変更は失われます。"
            : "閲覧専用です。変更は管理者に依頼してください。"}{" "}
          横にスクロールして全項目を確認できます。使用済みカテゴリは削除せず無効にして履歴を残します。有効な子が残る親は無効化できません。同じ親の下の同名は登録できません。
        </p>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="商品カテゴリの表"
          aria-describedby="category-help"
        >
          <table className="category-table">
            <thead>
              <tr>
                <th scope="col">カテゴリ名 / 階層</th>
                <th scope="col">親カテゴリ</th>
                <th scope="col">表示順</th>
                <th scope="col">状態</th>
                {admin && <th scope="col">操作</th>}
              </tr>
            </thead>
            <tbody>
              {categoryOrder(categories).map((c) =>
                admin ? (
                  <CategoryRow
                    key={`${profile.id}:${c.id}`}
                    category={c}
                    categories={categories}
                  />
                ) : (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.category_name}
                      <small>第{c.category_level}階層</small>
                    </th>
                    <td>
                      {categories.find((p) => p.id === c.parent_category_id)
                        ? categoryPath(
                            categories.find(
                              (p) => p.id === c.parent_category_id,
                            )!,
                            categories,
                          )
                        : "—"}
                    </td>
                    <td>{c.display_order}</td>
                    <td>
                      <span
                        className={`badge ${c.is_active ? "" : "inactive"}`}
                      >
                        {c.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                  </tr>
                ),
              )}
              {!categories.length && (
                <tr>
                  <td colSpan={admin ? 5 : 4}>
                    カテゴリはまだ登録されていません。
                  </td>
                </tr>
              )}
              {admin && (
                <CategoryRow
                  key={`${profile.id}:new`}
                  categories={categories}
                />
              )}
            </tbody>
          </table>
        </div>
      </section>
      {admin && <CategoryCsvPanel key={profile.id} />}
    </>
  );
}
