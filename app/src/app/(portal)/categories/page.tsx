import { requireProfile } from "@/lib/auth/session";
import { PageTitle, Empty } from "@/components/business-ui";
import { CategoryForm } from "./form";
import type { ProductCategory } from "@/types/database";
function treeOrder(
  categories: ProductCategory[],
  parent: string | null = null,
): ProductCategory[] {
  return categories
    .filter((c) => c.parent_category_id === parent)
    .flatMap((c) => [c, ...treeOrder(categories, c.id)]);
}
export default async function CategoriesPage() {
  const { supabase, profile } = await requireProfile();
  const { data, error } = await supabase
    .from("product_categories")
    .select("*")
    .order("display_order")
    .order("category_name");
  if (error) throw new Error("カテゴリ一覧を取得できません。");
  const categories = data ?? [];
  const admin = profile.role === "admin";
  return (
    <>
      <PageTitle
        title="商品カテゴリ管理"
        description="親子構造で商品カテゴリを管理します。正式な分類は店舗側で登録してください。"
      />
      {admin && (
        <section className="card">
          <h2>カテゴリを追加</h2>
          <CategoryForm categories={categories} />
        </section>
      )}
      <section className="card">
        <h2>カテゴリ一覧</h2>
        {!categories.length ? (
          <Empty>
            カテゴリはまだ登録されていません。管理者が正式なカテゴリを追加してください。
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>カテゴリ</th>
                  <th>階層</th>
                  <th>表示順</th>
                  <th>状態</th>
                  {admin && <th>編集</th>}
                </tr>
              </thead>
              <tbody>
                {treeOrder(categories).map((c) => (
                  <tr key={c.id}>
                    <td
                      style={{
                        paddingLeft:
                          12 + Math.min(10, c.category_level - 1) * 20,
                      }}
                    >
                      {c.category_name}
                    </td>
                    <td>{c.category_level}</td>
                    <td>{c.display_order}</td>
                    <td>
                      <span
                        className={`badge ${c.is_active ? "" : "inactive"}`}
                      >
                        {c.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    {admin && (
                      <td>
                        <details>
                          <summary>編集</summary>
                          <CategoryForm category={c} categories={categories} />
                        </details>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
