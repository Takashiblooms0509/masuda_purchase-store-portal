import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";

export default async function Dashboard() {
  const { profile, store } = await requireProfile();
  return <>
    <p className="eyebrow">ダッシュボード</p><h1>店舗運営の管理基盤</h1>
    <p className="muted">顧客情報・来店・買取取引を店舗別に管理できます。</p>
    <div className="summary-grid">
      <section className="card"><p className="muted">アクセス範囲</p><h2>{profile.role === "admin" ? "全店舗" : store?.name}</h2><p>店舗別の権限で保護されています。</p></section>
      <section className="card"><p className="muted">利用者権限</p><h2>{profile.role === "admin" ? "管理者" : "スタッフ"}</h2><p>アカウントは有効です。</p></section>
    </div>
    <div className="inline-actions"><Link className="button" href="/customers">顧客管理</Link><Link className="button secondary" href="/purchases">買取実績</Link></div>
    <section className="card"><h2>Phase2の構築範囲</h2><p>顧客・来店取引・商品明細の登録と編集、商品カテゴリ・原本情報の管理を利用できます。画像アップロード・AI読取はPhase4で追加します。</p><p className="muted">来店・成約・買取金額のダッシュボード集計はPhase3で追加します。</p>
      {profile.role === "admin" && <div className="inline-actions"><Link className="button" href="/admin/stores">店舗を管理</Link><Link className="button secondary" href="/admin/users">ユーザーを管理</Link></div>}
    </section>
  </>;
}
