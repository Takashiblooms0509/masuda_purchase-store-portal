// Phase1のmigrationに対応。Phase2以降はSupabase CLI生成型に置換可能。
export type Store = {
  id: string; code: string; name: string; is_active: boolean;
  created_at: string; updated_at: string;
};
export type Profile = {
  id: string; email: string; name: string; role: "admin" | "staff";
  store_id: string | null; is_active: boolean; created_at: string; updated_at: string;
};
export type Database = {
  public: {
    Tables: {
      stores: {
        Row: Store;
        Insert: { id?: string; code: string; name: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: Partial<Pick<Store, "code" | "name" | "is_active">>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: { id: string; email: string; name?: string; role?: "admin" | "staff"; store_id?: string | null; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: Partial<Pick<Profile, "name" | "role" | "store_id" | "is_active">>;
        Relationships: [{ foreignKeyName: "profiles_store_id_fkey"; columns: ["store_id"]; isOneToOne: false; referencedRelation: "stores"; referencedColumns: ["id"] }];
      };
    };
      Views: { [_ in never]: never };
      Functions: { [_ in never]: never };
      Enums: { [_ in never]: never };
      CompositeTypes: { [_ in never]: never };
    };
};
