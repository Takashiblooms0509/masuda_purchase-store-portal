import type { Profile, Store } from "@/types/database";

export function canUsePortal(profile: Profile | null, store: Store | null): boolean {
  if (!profile?.is_active) return false;
  if (profile.role === "admin") return true;
  return Boolean(profile.store_id && store?.id === profile.store_id && store.is_active);
}
