import { z } from "zod";
import { revalidatePath } from "next/cache";
import { apiSession } from "@/lib/documents/access";
import {
  privilegedClient,
  readingConfigured,
  openAiConfig,
} from "@/lib/documents/config";
import { SOURCE_BUCKET } from "@/lib/documents/limits";
import { validateImage } from "@/lib/documents/image";
import {
  readPurchaseImage,
  ReadingError,
  type ReadingErrorCode,
} from "@/lib/ai/read";
import { initialReview } from "@/lib/ai/schemas";
import type { Json } from "@/types/database";
import { sameOrigin } from "@/lib/documents/origin";
export const runtime = "nodejs";
export const maxDuration = 60;
const reply = (message: string, status: number) =>
  Response.json(
    { message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!sameOrigin(request)) return reply("この操作を実行できません。", 403);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      return reply("原本が見つかりません。", 404);
    const session = await apiSession();
    if (!session)
      return reply("ログインと利用者の設定を確認してください。", 401);
    const { data: document, error } = await session.supabase
      .from("document_imports")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !document) return reply("原本が見つかりません。", 404);
    if (!readingConfigured())
      return reply(
        "画像読取の準備が完了していません。管理者に確認してください。",
        503,
      );
    const privileged = privilegedClient(),
      config = openAiConfig();
    const claim = await privileged.rpc("claim_import_processing", {
      p_actor: session.user.id,
      p_id: id,
    });
    if (claim.error)
      return reply(
        claim.error.code === "55P03"
          ? "この原本は処理中または確認待ちです。画面を更新してください。"
          : "この原本は読み取れません。画像・書類種別・登録状況を確認してください。",
        409,
      );
    let result: Json = null,
      review: Json = null,
      errorCode: ReadingErrorCode | null = null;
    try {
      if (!document.file_url || !document.content_type || !document.file_size)
        throw new ReadingError("invalid_image");
      const downloaded = await privileged.storage
        .from(SOURCE_BUCKET)
        .download(document.file_url);
      if (downloaded.error || !downloaded.data)
        throw new ReadingError("connection");
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      try {
        await validateImage(bytes, document.content_type, document.file_size);
      } catch {
        throw new ReadingError("invalid_image");
      }
      const reading = await readPurchaseImage(
        bytes,
        document.content_type,
        config,
      );
      result = reading;
      review = initialReview(reading);
    } catch (error) {
      errorCode = error instanceof ReadingError ? error.code : "connection";
    }
    const finished = await privileged.rpc("finish_import_processing", {
      p_actor: session.user.id,
      p_id: id,
      p_token: claim.data,
      p_result: result,
      p_review: review,
      p_model: config.model,
      p_error_code: errorCode,
    });
    revalidatePath("/imports");
    revalidatePath(`/imports/${id}`);
    revalidatePath("/errors");
    if (finished.error || !finished.data)
      return reply(
        "処理結果を保存できませんでした。利用者設定と最新の処理状況を確認してください。",
        409,
      );
    return reply(
      errorCode
        ? "読取に失敗しました。エラー内容を確認してください。"
        : "読取が完了しました。原本と照合して修正してください。",
      errorCode ? 502 : 200,
    );
  } catch {
    return reply(
      "画像読取を開始できませんでした。接続状態を確認してください。",
      503,
    );
  }
}
