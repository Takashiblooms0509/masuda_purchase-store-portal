import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/login/actions";

export default async function AccountPendingPage() {
  const session = await getSession();
  if (session.allowed) redirect("/");
  return <main className="login-screen"><section className="login-card stack">
    <h1>利用設定を確認してください</h1>
    <p>アカウントまたは所属店舗が無効、あるいは店舗の割り当てが完了していません。管理者へご連絡ください。</p>
    <form action={logout}><button type="submit">ログアウト</button></form>
  </section></main>;
}
