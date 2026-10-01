"use client";

import { useActionState } from "react";
import { saveStore, saveProfile } from "./actions";
import type { Store, Profile } from "@/types/database";

export function StoreForm({ store }: { store?: Store }) {
  const [state, action, pending] = useActionState(saveStore, { message: "" });
  return <form action={action} className="stack">
    {store && <input type="hidden" name="id" value={store.id} />}
    <div className="form-grid">
      <label>店舗コード<input name="code" defaultValue={store?.code} required maxLength={30} /></label>
      <label>店舗名<input name="name" defaultValue={store?.name} required maxLength={100} /></label>
    </div>
    <label className="check"><input type="checkbox" name="is_active" defaultChecked={store?.is_active ?? true} />有効な店舗</label>
    {store && <p className="muted small">無効にすると所属スタッフは業務画面を利用できなくなります。</p>}
    {state.message && <p role="status" className={`notice ${state.success ? "success" : "error"}`}>{state.message}</p>}
    <div><button disabled={pending}>{pending ? "保存中…" : store ? "変更を保存" : "店舗を登録"}</button></div>
  </form>;
}

export function ProfileForm({ profile, stores }: { profile: Profile; stores: Store[] }) {
  const [state, action, pending] = useActionState(saveProfile, { message: "" });
  return <form action={action} className="stack">
    <input type="hidden" name="id" value={profile.id} />
    <div className="form-grid">
      <label>氏名<input name="name" defaultValue={profile.name} required maxLength={100} /></label>
      <label>権限<select name="role" defaultValue={profile.role}><option value="staff">スタッフ（所属店舗）</option><option value="admin">管理者（全店舗）</option></select></label>
      <label>所属店舗<select name="store_id" defaultValue={profile.store_id ?? ""}><option value="">未割り当て（管理者は所属なし可）</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}{!store.is_active ? "（無効）" : ""}</option>)}</select></label>
    </div>
    <label className="check"><input type="checkbox" name="is_active" defaultChecked={profile.is_active} />利用を有効にする</label>
    {state.message && <p role="status" className={`notice ${state.success ? "success" : "error"}`}>{state.message}</p>}
    <div><button disabled={pending}>{pending ? "保存中…" : "利用者設定を保存"}</button></div>
  </form>;
}
