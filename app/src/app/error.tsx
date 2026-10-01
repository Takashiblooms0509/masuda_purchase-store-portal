"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="card stack"><h1>画面を表示できません</h1><p>時間をおいて再度お試しください。初期設定中の場合は、管理者にSupabaseのmigration・環境変数の設定を確認してください。</p><button onClick={reset}>再試行</button></section>;
}
