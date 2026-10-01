import { notFound } from "next/navigation";
import { businessSession, validId } from "@/lib/business/access";
import { PageTitle } from "@/components/business-ui";
import { TransactionForm } from "../form";
import { processingLabels } from "@/lib/business/format";
export default async function PurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const id = validId((await params).id);
  const { supabase, stores } = await businessSession();
  const { data: transaction, error } = await supabase
    .from("purchase_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("取引を取得できません。");
  if (!transaction) notFound();
  const [
    itemsResult,
    customersResult,
    selectedResult,
    categoriesResult,
    importsResult,
    sourceResult,
  ] = await Promise.all([
    supabase
      .from("purchase_items")
      .select("*")
      .eq("purchase_transaction_id", id)
      .order("display_order")
      .order("id"),
    supabase
      .from("customers")
      .select("id,name,store_id,membership_card_number")
      .eq("store_id", transaction.store_id)
      .order("name")
      .order("id")
      .limit(30),
    supabase
      .from("customers")
      .select("id,name,store_id,membership_card_number")
      .eq("id", transaction.customer_id)
      .single(),
    supabase
      .from("product_categories")
      .select("*")
      .order("category_level")
      .order("display_order")
      .order("category_name"),
    supabase
      .from("document_imports")
      .select("*")
      .eq("store_id", transaction.store_id)
      .eq("document_type", "purchase_document")
      .order("created_at", { ascending: false })
      .limit(30),
    transaction.source_document_id
      ? supabase
          .from("document_imports")
          .select("*")
          .eq("id", transaction.source_document_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (
    itemsResult.error ||
    customersResult.error ||
    selectedResult.error ||
    categoriesResult.error ||
    importsResult.error ||
    sourceResult.error
  )
    throw new Error("取引の関連情報を取得できません。");
  const customers = customersResult.data ?? [];
  if (!customers.some((c) => c.id === selectedResult.data.id))
    customers.unshift(selectedResult.data);
  const imports = importsResult.data ?? [];
  const source = sourceResult.data;
  if (source && !imports.some((d) => d.id === source.id))
    imports.unshift(source);
  return (
    <>
      <PageTitle
        title={`買取取引 ${transaction.document_number ?? ""}`}
        description={`原本処理：${source ? processingLabels[source.processing_status] : "原本なし"}`}
      />
      {(await searchParams).saved === "1" && (
        <p role="status" className="notice success">
          取引と商品明細を保存しました。
        </p>
      )}
      <TransactionForm
        key={transaction.updated_at}
        stores={stores}
        transaction={transaction}
        customers={customers}
        items={itemsResult.data ?? []}
        categories={categoriesResult.data ?? []}
        imports={imports}
      />
    </>
  );
}
