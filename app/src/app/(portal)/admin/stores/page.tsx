import { requireAdmin } from "@/lib/auth/session";
import { StoreForm } from "../forms";

export default async function StoresPage() {
  const { supabase } = await requireAdmin();
  const { data: stores, error } = await supabase.from("stores").select("*").order("code");
  if (error) throw new Error("店舗一覧を取得できません。");
  return <><p className="eyebrow">管理者メニュー</p><h1>店舗管理</h1><p className="muted">店舗を登録・編集し、利用状態を管理します。</p>
    <section className="card"><h2>新しい店舗</h2><StoreForm /></section>
    <section className="card"><h2>登録済み店舗</h2>
      {!stores?.length ? <p className="muted">店舗はまだ登録されていません。</p> : <table><thead><tr><th>コード</th><th>店舗名</th><th>状態</th><th>編集</th></tr></thead><tbody>{stores.map((store) => <tr key={store.id}><td>{store.code}</td><td>{store.name}</td><td><span className={`badge ${store.is_active ? "" : "inactive"}`}>{store.is_active ? "有効" : "無効"}</span></td><td><details><summary>編集する</summary><StoreForm store={store} /></details></td></tr>)}</tbody></table>}
    </section></>;
}
