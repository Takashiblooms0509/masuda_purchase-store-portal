/** Use the HTTP host; Next.js may construct request.url with an internal hostname. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const source = new URL(origin);
    const protocol =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.slice(0, -1);
    return source.origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}
