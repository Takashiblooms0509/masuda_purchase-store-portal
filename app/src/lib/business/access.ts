import "server-only";
import { requireProfile } from "@/lib/auth/session";
import { z } from "zod";
import { notFound } from "next/navigation";

export async function businessSession() {
  const session = await requireProfile();
  const { data: stores, error } = await session.supabase
    .from("stores")
    .select("*")
    .order("code");
  if (error) throw new Error("店舗情報を取得できません。");
  return { ...session, stores: stores ?? [] };
}
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  return id;
}
export function storeAllowed(
  session: Awaited<ReturnType<typeof businessSession>>,
  storeId: string,
): boolean {
  return session.stores.some(
    (store) =>
      store.id === storeId &&
      (session.profile.role === "admin" || store.is_active),
  );
}
export function saveError(code: string | undefined): string {
  if (code === "23505")
    return "この原本はすでに別の取引に紐づいています。重複を確認してください。";
  if (code === "23503")
    return "顧客・店舗・カテゴリ・原本の紐付けを確認してください。";
  if (code === "23514")
    return "入力値または親子関係に問題があります。店舗や書類種別・カテゴリの親子関係を確認してください。";
  if (code === "42501") return "このデータを保存する権限がありません。";
  return "保存できません。入力内容と接続状態を確認してください。";
}
