import { requireAdmin } from "@/lib/auth/session";
import { readCategories } from "@/lib/categories/read";
import { categoryCsv } from "@/lib/categories/csv";
export async function GET() {
  const { supabase } = await requireAdmin();
  const csv = categoryCsv(await readCategories(supabase));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="categories.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
