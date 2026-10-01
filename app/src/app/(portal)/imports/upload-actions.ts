"use server";
import { z } from "zod";
import { businessSession, storeAllowed } from "@/lib/business/access";
import { privilegedClient, uploadConfigured } from "@/lib/documents/config";
import { SOURCE_BUCKET, MAX_IMAGE_BYTES } from "@/lib/documents/limits";
import { sourceDocument, documentKind } from "@/lib/documents/access";
import { validateImage } from "@/lib/documents/image";
import { revalidatePath } from "next/cache";
const uploadSchema = z
  .object({
    kind: documentKind,
    id: z.uuid().nullable(),
    store_id: z.uuid(),
    customer_id: z.uuid().nullable(),
    document_type: z.enum([
      "purchase_document",
      "customer_identification",
      "membership_card",
      "other",
      "drivers_license",
      "my_number_card",
      "passport",
    ]),
    file_name: z.string().trim().min(1).max(255),
    mime: z.enum(["image/jpeg", "image/png"]),
    size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  })
  .refine((value) =>
    value.mime === "image/png"
      ? /\.png$/i.test(value.file_name)
      : /\.jpe?g$/i.test(value.file_name),
  );
export async function beginUpload(input: unknown): Promise<{
  message: string;
  upload?: { id: string; path: string; token: string };
}> {
  const session = await businessSession(),
    parsed = uploadSchema.safeParse(input);
  if (!parsed.success)
    return {
      message: "JPG・JPEG・PNGの10MB以下の画像を選び、店舗を確認してください。",
    };
  const value = parsed.data;
  if (!storeAllowed(session, value.store_id))
    return { message: "所属店舗の画像のみ登録できます。" };
  if (!uploadConfigured())
    return {
      message: "画像保存の準備が完了していません。管理者に確認してください。",
    };
  try {
    let id = value.id;
    if (id) {
      const original = await sourceDocument(session.supabase, value.kind, id);
      if (!original || original.file_url)
        return { message: "原本が見つからないか、画像が登録済みです。" };
    } else if (value.kind === "import") {
      if (
        ![
          "purchase_document",
          "customer_identification",
          "membership_card",
          "other",
        ].includes(value.document_type)
      )
        return { message: "書類種別を確認してください。" };
      const created = await session.supabase
        .from("document_imports")
        .insert({
          store_id: value.store_id,
          file_name: value.file_name,
          document_type: value.document_type as
            | "purchase_document"
            | "customer_identification"
            | "membership_card"
            | "other",
        })
        .select("id")
        .single();
      if (created.error) return { message: "原本情報を登録できませんでした。" };
      id = created.data.id;
    } else {
      if (
        !value.customer_id ||
        !["drivers_license", "my_number_card", "passport", "other"].includes(
          value.document_type,
        )
      )
        return { message: "顧客・書類種別を確認してください。" };
      const customer = await session.supabase
        .from("customers")
        .select("store_id")
        .eq("id", value.customer_id)
        .eq("store_id", value.store_id)
        .maybeSingle();
      if (customer.error || !customer.data)
        return { message: "顧客が見つかりません。" };
      const created = await session.supabase
        .from("customer_documents")
        .insert({
          customer_id: value.customer_id,
          file_name: value.file_name,
          document_type: value.document_type as
            "drivers_license" | "my_number_card" | "passport" | "other",
        })
        .select("id")
        .single();
      if (created.error) return { message: "書類情報を登録できませんでした。" };
      id = created.data.id;
    }
    const privileged = privilegedClient();
    const reservation = await privileged.rpc("prepare_document_upload", {
      p_actor: session.user.id,
      p_kind: value.kind,
      p_id: id,
      p_mime: value.mime,
      p_size: value.size,
    });
    if (reservation.error)
      return {
        message:
          "画像を保存できません。登録状況を確認し、再試行時は同じ画像を選んでください。",
      };
    const signed = await privileged.storage
      .from(SOURCE_BUCKET)
      .createSignedUploadUrl(reservation.data, { upsert: false });
    if (signed.error)
      return {
        message: "画像転送を準備できません。時間をおいて再度お試しください。",
      };
    return {
      message: "画像を転送します。",
      upload: { id, path: signed.data.path, token: signed.data.token },
    };
  } catch {
    return {
      message: "画像転送を準備できません。接続状態を確認してください。",
    };
  }
}
export async function finishUpload(
  kind: unknown,
  id: unknown,
): Promise<{ success?: boolean; message: string }> {
  const parsedKind = documentKind.safeParse(kind),
    parsedId = z.uuid().safeParse(id);
  if (!parsedKind.success || !parsedId.success)
    return { message: "原本を確認してください。" };
  const session = await businessSession();
  if (!uploadConfigured())
    return {
      message: "画像保存の準備が完了していません。管理者に確認してください。",
    };
  try {
    const document = await sourceDocument(
      session.supabase,
      parsedKind.data,
      parsedId.data,
    );
    if (
      !document?.upload_path ||
      !document.expected_file_size ||
      !document.content_type
    )
      return { message: "画像の転送準備が完了していません。" };
    if (document.file_url)
      return { message: "画像は登録済みです。", success: true };
    const privileged = privilegedClient();
    const object = await privileged.storage
      .from(SOURCE_BUCKET)
      .download(document.upload_path);
    if (object.error || !object.data)
      return {
        message: "画像転送が完了していません。同じ画像で再試行してください。",
      };
    try {
      await validateImage(
        new Uint8Array(await object.data.arrayBuffer()),
        document.content_type,
        document.expected_file_size,
      );
    } catch {
      return {
        message:
          "画像を確認できません。JPG・PNGの10MB以下・4,000万画素以下の画像を選んでください。",
      };
    }
    const completed = await privileged.rpc("complete_document_upload", {
      p_actor: session.user.id,
      p_kind: parsedKind.data,
      p_id: parsedId.data,
    });
    if (completed.error)
      return {
        message: "画像の登録を完了できません。登録状況を確認してください。",
      };
    revalidatePath("/imports", "layout");
    revalidatePath("/customers", "layout");
    revalidatePath("/errors");
    return { message: "画像を保存しました。", success: true };
  } catch {
    return {
      message: "画像の登録を完了できません。接続状態を確認してください。",
    };
  }
}
