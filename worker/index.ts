/**
 * Pitchboard Worker — the API surface. The SPA itself is served by the static-asset
 * layer ahead of this script (see `run_worker_first` in wrangler.jsonc), so a page load
 * never reaches here and never counts against the free tier's request budget.
 *
 * `Env` is ambient, generated from wrangler.jsonc by `wrangler types` into
 * worker-configuration.d.ts — which is gitignored and rebuilt by the `types` script that
 * both typecheck and build run first. Adding a binding to wrangler.jsonc is therefore the
 * only place a binding is declared; there is no hand-written mirror to drift from it.
 */

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
