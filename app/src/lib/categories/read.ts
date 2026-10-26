import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProductCategory } from "@/types/database";
export async function readCategories(supabase: SupabaseClient<Database>) {
  const rows: ProductCategory[] = [];
  for (let offset = 0; offset <= 10000; offset += 1000) {
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("カテゴリ一覧を取得できません。");
    if (offset === 10000 && data?.length)
      throw new Error("カテゴリ件数が多いため管理者による確認が必要です。");
    rows.push(...(data ?? []));
    if (!data || data.length < 1000)
      return rows.sort(
        (a, b) =>
          a.display_order - b.display_order ||
          a.category_name.localeCompare(b.category_name, "ja"),
      );
  }
  return rows;
}
