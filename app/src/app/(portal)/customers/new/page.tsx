import { businessSession } from "@/lib/business/access";
import { PageTitle } from "@/components/business-ui";
import { CustomerForm } from "../forms";
export default async function NewCustomerPage() {
  const { stores } = await businessSession();
  return (
    <>
      <PageTitle
        title="顧客を登録"
        description="既存顧客候補を確認してから新規登録します。"
      />
      <section className="card">
        <CustomerForm stores={stores} />
      </section>
    </>
  );
}
