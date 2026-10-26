import { requireProfile } from "@/lib/auth/session";
import { readCategories } from "@/lib/categories/read";
import { CategoryMaster } from "./master-table";
export default async function CategoriesPage() {
  const { supabase, profile } = await requireProfile();
  const categories = await readCategories(supabase);
  return (
    <CategoryMaster
      key={profile.id}
      categories={categories}
      admin={profile.role === "admin"}
    />
  );
}
