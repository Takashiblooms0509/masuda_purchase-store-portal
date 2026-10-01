import { describe, expect, it } from "vitest";
import { canUsePortal } from "@/lib/auth/rules";
import { profileSchema, loginSchema } from "@/lib/forms";
import type { Profile, Store } from "@/types/database";

const profile: Profile = { id: "00000000-0000-4000-8000-000000000001", email: "staff@example.test", name: "テスト", role: "staff", store_id: "10000000-0000-4000-8000-000000000001", is_active: true, created_at: "", updated_at: "" };
const store: Store = { id: profile.store_id!, name: "店舗", code: "A", is_active: true, created_at: "", updated_at: "" };
describe("業務画面の利用判定と入力", () => {
  it("profileなし、無効利用者、店舗なし、他店舗、無効店舗を拒否", () => {
    expect(canUsePortal(null, store)).toBe(false);
    expect(canUsePortal({ ...profile, is_active: false }, store)).toBe(false);
    expect(canUsePortal(profile, null)).toBe(false);
    expect(canUsePortal(profile, { ...store, id: "different" })).toBe(false);
    expect(canUsePortal(profile, { ...store, is_active: false })).toBe(false);
  });
  it("所属店舗が有効なstaffと有効adminを許可", () => {
    expect(canUsePortal(profile, store)).toBe(true);
    expect(canUsePortal({ ...profile, role: "admin", store_id: null }, null)).toBe(true);
    expect(canUsePortal({ ...profile, role: "admin", is_active: false }, null)).toBe(false);
  });
  it("有効staffの未割当・不正なroleを拒否", () => {
    expect(profileSchema.safeParse({ ...profile, store_id: null }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, role: "owner" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, store_id: null, is_active: false }).success).toBe(true);
  });
  it("パスワードの前後空白を変更せず認証へ渡す", () => {
    expect(loginSchema.parse({ email: "staff@example.test", password: " password " }).password).toBe(" password ");
  });
});
