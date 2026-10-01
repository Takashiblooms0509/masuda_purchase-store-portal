import { requireAdmin } from "@/lib/auth/session";
import { ProfileForm } from "../forms";

export default async function UsersPage() {
  const { supabase } = await requireAdmin();
  const [profilesResult, storesResult] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("stores").select("*").order("code"),
  ]);
  if (profilesResult.error || storesResult.error) throw new Error("利用者設定を取得できません。");
  const stores = storesResult.data ?? [];
  return <><p className="eyebrow">管理者メニュー</p><h1>ユーザー管理</h1>
    <p className="muted">発行済みアカウントの所属店舗・権限を設定します。</p>
    <section className="card"><h2>アカウントの追加</h2><p>Phase1ではSupabaseのAuthentication → Users → Add user → Create new userで発行し、その後この画面で氏名・所属・権限を設定して有効にします。</p><p className="muted small">管理者は全店舗を編集できます。権限を付与する相手を確認してください。パスワード・メール変更はSupabase側で管理します。</p></section>
    <section className="card"><h2>利用者一覧</h2><div className="table-scroll"><table><thead><tr><th>利用者</th><th>権限</th><th>所属店舗</th><th>状態</th><th>設定</th></tr></thead><tbody>
      {profilesResult.data?.map((profile) => <tr key={profile.id}><td><strong>{profile.name || "氏名未設定"}</strong><span className="cell-sub">{profile.email}</span></td><td>{profile.role === "admin" ? "管理者" : "スタッフ"}</td><td>{stores.find((s) => s.id === profile.store_id)?.name ?? "—"}</td><td><span className={`badge ${profile.is_active ? "" : "inactive"}`}>{profile.is_active ? "有効" : "無効"}</span></td><td><details><summary>設定する</summary><ProfileForm profile={profile} stores={stores} /></details></td></tr>)}
    </tbody></table></div></section>
  </>;
}
