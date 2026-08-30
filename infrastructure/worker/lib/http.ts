/**
 * JSON responses for the API surface.
 *
 * Every response is `no-store`. These are per-user answers behind a session cookie, and
 * Cloudflare's cache sits in front of the Worker — an authenticated body cached at an edge
 * is served to the next person through that colo.
 */

const NO_STORE = { "cache-control": "no-store" } as const;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * A machine-readable code, never a sentence. The Worker has no locale — the client picks the
 * message, the same reason the pure engine modules return a `Message` rather than prose (D38).
 */
export function fail(code: string, status: number, headers: HeadersInit = {}): Response {
  return json({ error: code }, status, headers);
}
