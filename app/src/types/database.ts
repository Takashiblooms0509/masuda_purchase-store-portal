export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
type Timestamps = { created_at: string; updated_at: string };
export type Store = Timestamps & {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};
export type Profile = Timestamps & {
  id: string;
  email: string;
  name: string;
  role: "admin" | "staff";
  store_id: string | null;
  is_active: boolean;
};
export type CustomerFields = {
  name: string;
  name_kana: string | null;
  birth_date: string | null;
  occupation: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  dm_allowed: boolean | null;
  membership_card_number: string | null;
  identification_type: string | null;
  identification_number: string | null;
};
export type Customer = Timestamps &
  CustomerFields & {
    id: string;
    store_id: string;
    first_visit_date: string | null;
    last_visit_date: string | null;
  };
export type CustomerDocument = {
  id: string;
  customer_id: string;
  document_type: "drivers_license" | "my_number_card" | "passport" | "other";
  file_name: string;
  file_url: string | null;
  drive_file_id: string | null;
  uploaded_at: string | null;
  created_at: string;
};
export type ProductCategory = Timestamps & {
  id: string;
  parent_category_id: string | null;
  category_name: string;
  category_level: number;
  display_order: number;
  is_active: boolean;
};
export type DocumentImport = Timestamps & {
  id: string;
  store_id: string;
  document_type:
    | "purchase_document"
    | "customer_identification"
    | "membership_card"
    | "other";
  file_name: string;
  file_url: string | null;
  drive_file_id: string | null;
  processing_status:
    "pending" | "processing" | "review_required" | "completed" | "failed";
  error_message: string | null;
  retry_count: number;
  processed_at: string | null;
};
export type TransactionFields = {
  customer_id: string;
  document_number: string | null;
  visit_datetime: string;
  purchase_staff_name: string | null;
  payment_staff_name: string | null;
  transaction_status: "completed" | "not_completed";
  visit_source: string | null;
  visit_source_detail: string | null;
  purchase_item_count: number | null;
  purchase_total: number | null;
  source_document_id: string | null;
  notes: string | null;
};
export type PurchaseTransaction = Timestamps &
  TransactionFields & { id: string; store_id: string };
export type ItemFields = {
  product_category_id: string | null;
  item_name: string;
  denomination_or_weight: string | null;
  quantity: number | null;
  purchase_amount: number | null;
  category_reviewed: boolean;
  notes: string | null;
};
export type PurchaseItem = Timestamps &
  ItemFields & {
    id: string;
    purchase_transaction_id: string;
    display_order: number;
    raw_item_name: string | null;
    category_confidence: number | null;
  };
type Relation = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type Table<Row, Insert, Update, Relationships extends Relation[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};
export type Database = {
  public: {
    Tables: {
      stores: Table<
        Store,
        { code: string; name: string; is_active?: boolean },
        Partial<Pick<Store, "code" | "name" | "is_active">>
      >;
      profiles: Table<
        Profile,
        {
          id: string;
          email: string;
          name?: string;
          role?: "admin" | "staff";
          store_id?: string | null;
          is_active?: boolean;
        },
        Partial<Pick<Profile, "name" | "role" | "store_id" | "is_active">>,
        [
          {
            foreignKeyName: "profiles_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ]
      >;
      customers: Table<
        Customer,
        CustomerFields & { store_id: string },
        Partial<CustomerFields>
      >;
      customer_documents: Table<
        CustomerDocument,
        Pick<CustomerDocument, "customer_id" | "document_type" | "file_name">,
        Partial<Pick<CustomerDocument, "document_type" | "file_name">>
      >;
      product_categories: Table<
        ProductCategory,
        Pick<
          ProductCategory,
          "parent_category_id" | "category_name" | "display_order" | "is_active"
        >,
        Partial<
          Pick<
            ProductCategory,
            | "parent_category_id"
            | "category_name"
            | "display_order"
            | "is_active"
          >
        >
      >;
      document_imports: Table<
        DocumentImport,
        Pick<DocumentImport, "store_id" | "document_type" | "file_name">,
        Partial<Pick<DocumentImport, "document_type" | "file_name">>
      >;
      purchase_transactions: Table<
        PurchaseTransaction,
        TransactionFields & { store_id: string },
        Partial<TransactionFields>
      >;
      purchase_items: Table<
        PurchaseItem,
        ItemFields & { purchase_transaction_id: string },
        Partial<ItemFields>
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      find_customer_candidates: {
        Args: { p_store_id: string; p_customer: Json };
        Returns: Customer[];
      };
      save_purchase_transaction: {
        Args: { p_id: string | null; p_transaction: Json; p_items: Json };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
