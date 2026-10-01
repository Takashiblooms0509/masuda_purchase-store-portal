import { z } from "zod";
import {
  apiSession,
  documentKind,
  sourceDocument,
} from "@/lib/documents/access";
import { SOURCE_BUCKET } from "@/lib/documents/limits";
export const runtime = "nodejs";
const noStore = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await context.params;
    const parsedKind = documentKind.safeParse(kind);
    if (!parsedKind.success || !z.uuid().safeParse(id).success)
      return new Response(null, { status: 404, headers: noStore });
    const session = await apiSession();
    if (!session) return new Response(null, { status: 401, headers: noStore });
    const document = await sourceDocument(
      session.supabase,
      parsedKind.data,
      id,
    );
    if (!document?.file_url || !document.content_type)
      return new Response(null, { status: 404, headers: noStore });
    const { data, error } = await session.supabase.storage
      .from(SOURCE_BUCKET)
      .download(document.file_url);
    if (error || !data)
      return new Response(null, { status: 404, headers: noStore });
    return new Response(data, {
      headers: {
        ...noStore,
        "Content-Type": document.content_type,
        "Content-Disposition": 'inline; filename="source-image"',
      },
    });
  } catch {
    return new Response(null, { status: 503, headers: noStore });
  }
}
