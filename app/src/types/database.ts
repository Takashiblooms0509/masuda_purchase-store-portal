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
  upload_path: string | null;
  content_type: "image/jpeg" | "image/png" | null;
  expected_file_size: number | null;
  file_size: number | null;

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
  upload_path: string | null;
  content_type: "image/jpeg" | "image/png" | null;
  expected_file_size: number | null;
  file_size: number | null;
  processing_started_at: string | null;
  processing_token: string | null;
  ai_result: Json | null;
  reviewed_result: Json | null;
  ai_schema_version: string | null;
  ai_model: string | null;

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
export type DashboardSummary = {
  aggregation_date: string;
  today_visits: number;
  today_completed: number;
  today_not_completed: number;
  today_purchase_total: number;
  today_unpriced: number;
  month_visits: number;
  month_completed: number;
  month_purchase_total: number;
  month_unpriced: number;
};
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
      prepare_document_upload: {
        Args: {
          p_actor: string;
          p_kind: string;
          p_id: string;
          p_mime: string;
          p_size: number;
        };
        Returns: string;
      };
      complete_document_upload: {
        Args: { p_actor: string; p_kind: string; p_id: string };
        Returns: undefined;
      };
      claim_import_processing: {
        Args: { p_actor: string; p_id: string };
        Returns: string;
      };
      finish_import_processing: {
        Args: {
          p_actor: string;
          p_id: string;
          p_token: string;
          p_result: Json;
          p_review: Json;
          p_model: string | null;
          p_error_code: string | null;
        };
        Returns: boolean;
      };
      save_import_review: {
        Args: { p_id: string; p_review: Json; p_expected_updated_at: string };
        Returns: undefined;
      };

      get_dashboard_summary: {
        Args: { p_as_of?: string };
        Returns: DashboardSummary[];
      };
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
