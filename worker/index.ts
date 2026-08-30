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

import { fail, json } from "./lib/http";
import { clearedSessionCookie, destroySession, resolveSession } from "./lib/session";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // Only reachable if the asset layer defers to the script; the SPA is hash-routed,
      // so every real path is "/" and this is a backstop rather than a route table.
      return env.ASSETS.fetch(request);
    }

    // One clock reading per request, passed down. Sessions are compared against it in
    // several places and a function that read the time twice could expire a session
    // between the check and the renewal.
    const now = Math.floor(Date.now() / 1000);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case "GET /api/me": {
        const user = await resolveSession(env, request, now);
        return user ? json({ user }) : fail("unauthorized", 401);
      }

      // Idempotent, and never reports whether there was anything to sign out of: the
      // cookie is cleared either way, so a stale tab cannot learn anything by asking.
      case "POST /api/auth/logout": {
        await destroySession(env, request);
        return json({ ok: true }, 200, { "set-cookie": clearedSessionCookie() });
      }

      default:
        return fail("not_implemented", 501);
    }
  },
};
