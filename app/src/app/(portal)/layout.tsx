import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { logout } from "@/app/login/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, store } = await requireProfile();
  return <div className="portal-shell">
    <aside className="sidebar">
      <Link href="/" className="brand">買取店管理<span>MASUDA STORE PORTAL</span></Link>
      <nav aria-label="メインメニュー">
        <Link href="/">ダッシュボード</Link>
        <Link href="/customers">顧客管理</Link><Link href="/purchases">買取実績</Link><Link href="/imports">データ取込</Link><Link href="/categories">商品カテゴリ管理</Link><span className="nav-planned">エラー一覧<small>準備中</small></span>
        {profile.role === "admin" && <><p className="nav-section">管理</p><Link href="/admin/stores">店舗管理</Link><Link href="/admin/users">ユーザー管理</Link></>}
      </nav>
      <div className="sidebar-account"><strong>{profile.name || "利用者"}</strong><span>{profile.role === "admin" ? "管理者 · 全店舗" : store?.name}</span>
        <form action={logout}><button className="secondary" type="submit">ログアウト</button></form>
      </div>
    </aside>
    <div className="workspace"><header className="topbar"><span>買取店管理ポータル</span><span className="badge">{profile.role === "admin" ? "全店舗" : store?.name}</span></header><main className="page-content">{children}</main></div>
  </div>;
}
