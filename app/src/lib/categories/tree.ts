import type { ProductCategory } from "@/types/database";

// Visit each ID once so malformed or orphaned rows remain visible without recursion loops.
export function categoryOrder(categories: ProductCategory[]) {
  const result: ProductCategory[] = [];
  const seen = new Set<string>();
  function visit(row: ProductCategory) {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    result.push(row);
    categories.filter((c) => c.parent_category_id === row.id).forEach(visit);
  }
  categories.filter((c) => !c.parent_category_id).forEach(visit);
  categories.forEach(visit);
  return result;
}
export function categoryParents(categories: ProductCategory[], id?: string) {
  const excluded = new Set<string>();
  const pending = id ? [id] : [];
  while (pending.length) {
    const current = pending.pop()!;
    if (excluded.has(current)) continue;
    excluded.add(current);
    categories
      .filter((c) => c.parent_category_id === current)
      .forEach((c) => pending.push(c.id));
  }
  return categoryOrder(categories).filter((c) => !excluded.has(c.id));
}
export function categoryPath(
  category: ProductCategory,
  categories: ProductCategory[],
) {
  const names = [category.category_name];
  const seen = new Set([category.id]);
  let parent = category.parent_category_id;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const row = categories.find((c) => c.id === parent);
    if (!row) break;
    names.unshift(row.category_name);
    parent = row.parent_category_id;
  }
  return names.join(" / ");
}
