import { businessSession } from "@/lib/business/access";
import { PageTitle } from "@/components/business-ui";
import { TransactionForm } from "../form";
import { z } from "zod";
export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { supabase, stores } = await businessSession();
  const requested = (await searchParams).customer;
  const [customersResult, categoriesResult, importsResult, selectedResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id,name,store_id,membership_card_number")
        .order("name")
        .order("id")
        .limit(30),
      supabase
        .from("product_categories")
        .select("*")
        .order("category_level")
        .order("display_order")
        .order("category_name"),
      supabase
        .from("document_imports")
        .select("*")
        .eq("document_type", "purchase_document")
        .order("created_at", { ascending: false })
        .limit(100),
      requested && z.uuid().safeParse(requested).success
        ? supabase
            .from("customers")
            .select("id,name,store_id,membership_card_number")
            .eq("id", requested)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (
    customersResult.error ||
    categoriesResult.error ||
    importsResult.error ||
    selectedResult.error
  )
    throw new Error("取引登録用の情報を取得できません。");
  const selected = selectedResult.data;
  const customers = customersResult.data ?? [];
  if (selected && !customers.some((c) => c.id === selected.id))
    customers.unshift(selected);
  return (
    <>
      <PageTitle
        title="来店・買取取引を登録"
        description="買取計算書1枚を1回来店・1取引として登録します。"
      />
      <TransactionForm
        stores={stores}
        customers={customers}
        initialCustomer={selected ?? undefined}
        items={[]}
        categories={categoriesResult.data ?? []}
        imports={importsResult.data ?? []}
      />
    </>
  );
}
