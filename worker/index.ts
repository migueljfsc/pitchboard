/**
 * Pitchboard Worker — the API surface. The SPA itself is served by the static-asset
 * layer ahead of this script (see `run_worker_first` in wrangler.jsonc), so a page load
 * never reaches here and never counts against the free tier's request budget.
 *
 * Bindings declared in wrangler.jsonc but not yet used (DB, SNAPSHOTS) are deliberately
 * absent from `Env`: they get their real types from `wrangler types` when the endpoints
 * that touch them land, rather than hand-written stand-ins that would then conflict.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "not_implemented" },
        { status: 501, headers: { "cache-control": "no-store" } },
      );
    }

    // Only reachable if the asset layer defers to the script; the SPA is hash-routed,
    // so every real path is "/" and this is a backstop rather than a route table.
    return env.ASSETS.fetch(request);
  },
};
