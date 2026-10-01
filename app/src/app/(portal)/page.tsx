import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";

export default async function Dashboard() {
  const { profile, store } = await requireProfile();
  return <>
    <p className="eyebrow">ダッシュボード</p><h1>店舗運営の管理基盤</h1>
    <p className="muted">認証・店舗・ユーザーの設定を確認できます。</p>
    <div className="summary-grid">
      <section className="card"><p className="muted">アクセス範囲</p><h2>{profile.role === "admin" ? "全店舗" : store?.name}</h2><p>店舗別の権限で保護されています。</p></section>
      <section className="card"><p className="muted">利用者権限</p><h2>{profile.role === "admin" ? "管理者" : "スタッフ"}</h2><p>アカウントは有効です。</p></section>
    </div>
    <section className="card"><h2>Phase1の構築範囲</h2><p>ログイン、店舗マスタ、利用者の所属・権限設定まで利用できます。顧客・買取・AI画像読取は次の開発段階で追加します。</p><p className="muted">来店・成約・買取金額の集計は、買取取引機能を追加した後に表示します。</p>
      {profile.role === "admin" && <div className="inline-actions"><Link className="button" href="/admin/stores">店舗を管理</Link><Link className="button secondary" href="/admin/users">ユーザーを管理</Link></div>}
    </section>
  </>;
}
