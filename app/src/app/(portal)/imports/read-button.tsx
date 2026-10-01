"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function ReadButton({
  id,
  status,
  enabled,
  expired = false,
}: {
  id: string;
  status: string;
  enabled: boolean;
  expired?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (status !== "processing" || expired) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [status, expired, router]);
  const available =
    enabled &&
    (status === "pending" ||
      status === "failed" ||
      (status === "processing" && expired));
  return (
    <div className="stack">
      <button
        type="button"
        disabled={!available || pending}
        onClick={async () => {
          setPending(true);
          setMessage("画像を読み取っています。");
          try {
            const response = await fetch(`/api/imports/${id}/read`, {
              method: "POST",
            });
            const result = await response.json();
            setMessage(
              typeof result.message === "string"
                ? result.message
                : "処理状況を確認してください。",
            );
          } catch {
            setMessage(
              "読取サービスに接続できません。処理状況を更新して確認してください。",
            );
          } finally {
            setPending(false);
            router.refresh();
          }
        }}
      >
        {pending
          ? "読取中…"
          : status === "processing" && !expired
            ? "処理中"
            : status === "failed" || expired
              ? "再処理"
              : "AIで読み取る"}
      </button>
      {message && (
        <p role="status" className="muted small">
          {message}
        </p>
      )}
    </div>
  );
}
