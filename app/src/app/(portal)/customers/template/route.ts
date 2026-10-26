import { businessSession } from "@/lib/business/access";
import { customerCsvTemplate } from "@/lib/customers/csv";
export async function GET() {
  await businessSession();
  return new Response(customerCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="customer-template.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
