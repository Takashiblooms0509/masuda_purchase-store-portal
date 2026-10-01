import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <main className="login-screen"><section className="login-card">
    <p className="eyebrow">MASUDA · STORE PORTAL</p>
    <h1>買取店管理ポータル</h1>
    <p className="muted">店舗の情報を、安全にひとつの場所へ。</p>
    <LoginForm />
  </section></main>;
}
