import { z } from "zod";
import { apiSession } from "@/lib/documents/access";
import { privilegedClient } from "@/lib/documents/config";
import { SOURCE_BUCKET } from "@/lib/documents/limits";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; document: string }> },
) {
  try {
    const { id, document } = await context.params;
    if (
      !z.uuid().safeParse(id).success ||
      !z.uuid().safeParse(document).success
    )
      return new Response(null, { status: 404, headers });
    const session = await apiSession();
    if (!session) return new Response(null, { status: 401, headers });
    const service = privilegedClient();
    const result = await service.rpc("customer_media_source", {
      p_actor: session.user.id,
      p_customer: id,
      p_document: document,
    });
    const parsed = z
      .strictObject({
        path: z.string().min(1),
        content_type: z.enum(["image/jpeg", "image/png"]),
      })
      .safeParse(result.data);
    if (result.error || !parsed.success)
      return new Response(null, { status: 404, headers });
    const signed = await service.storage
      .from(SOURCE_BUCKET)
      .createSignedUrl(parsed.data.path, 60);
    if (signed.error || !signed.data)
      return new Response(null, { status: 503, headers });
    // Only server-resolved object; signed capability expires in 60 seconds.
    return new Response(null, {
      status: 307,
      headers: { ...headers, Location: signed.data.signedUrl },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
