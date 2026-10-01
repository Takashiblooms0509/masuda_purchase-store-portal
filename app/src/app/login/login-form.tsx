"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { message: "" });
  return <form action={action} className="stack">
    <label>メールアドレス<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
    <label>パスワード<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
    {state.message && <p className="notice error" role="alert">{state.message}</p>}
    <button disabled={pending} type="submit">{pending ? "ログイン中…" : "ログイン"}</button>
    <p className="muted small">アカウント発行・パスワードの再設定は店舗管理者へご連絡ください。</p>
  </form>;
}
