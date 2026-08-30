/**
 * Pitchboard Worker — the API surface. The SPA itself is served by the static-asset
 * layer ahead of this script (see `run_worker_first` in wrangler.jsonc), so a page load
 * never reaches here and never counts against the free tier's request budget.
 *
 * `Env` is ambient: worker-configuration.d.ts is generated from wrangler.jsonc by the
 * `types` script that typecheck and build both run first, and worker/secrets.d.ts merges in
 * the secrets wrangler.jsonc cannot hold. Adding a binding to wrangler.jsonc is therefore the
 * only place a binding is declared; there is no hand-written mirror to drift from it.
 */

import {
  authorizeUrl,
  clearedOauthCookie,
  exchangeCode,
  newOauthChallenge,
  oauthCookie,
  OAUTH_COOKIE,
  parseOauthCookie,
  timingSafeEqual,
} from "./lib/google";
import {
  createBoard,
  createProject,
  deleteBoard,
  deleteProject,
  getBoard,
  listBoards,
  listProjects,
  renameProject,
  updateBoard,
  type Ctx,
} from "./lib/boards";
import { fail, json } from "./lib/http";
import {
  clearedSessionCookie,
  createSession,
  destroySession,
  readCookie,
  resolveSession,
  sessionCookie,
  SESSION_TTL_S,
} from "./lib/session";
import { userForGoogleIdentity } from "./lib/users";

/**
 * Sign-in ends in a browser navigation, not a fetch, so a failure has to be something a page
 * can render rather than a status code nobody sees. The reason rides in the query string;
 * the SPA reads it and the hash — which carries shared boards (D33) — is left alone.
 */
function backToApp(origin: string, error?: string): Response {
  const url = error ? `${origin}/?auth_error=${encodeURIComponent(error)}` : `${origin}/`;
  return new Response(null, {
    status: 302,
    headers: { location: url, "set-cookie": clearedOauthCookie(), "cache-control": "no-store" },
  });
}

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

      case "GET /api/auth/google/start": {
        const { state, verifier } = newOauthChallenge();
        return new Response(null, {
          status: 302,
          headers: {
            location: await authorizeUrl(env.GOOGLE_CLIENT_ID, url.origin, state, verifier),
            "set-cookie": oauthCookie(state, verifier),
            "cache-control": "no-store",
          },
        });
      }

      case "GET /api/auth/google/callback": {
        // Google reports a declined consent screen here rather than by failing the redirect.
        const denied = url.searchParams.get("error");
        if (denied) return backToApp(url.origin, denied);

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const challenge = parseOauthCookie(readCookie(request.headers.get("cookie"), OAUTH_COOKIE));

        // The state check is the CSRF defence: without it, an attacker can complete a
        // sign-in of their own account in someone else's browser and watch what they save.
        if (!code || !state || !challenge || !timingSafeEqual(state, challenge.state)) {
          return backToApp(url.origin, "invalid_state");
        }

        let user;
        try {
          const identity = await exchangeCode(env, code, url.origin, challenge.verifier);
          user = await userForGoogleIdentity(env, identity, now);
        } catch (cause) {
          // The message is one of this module's own codes — never Google's body, which
          // would put an unbounded string into a URL the browser then displays.
          return backToApp(url.origin, cause instanceof Error ? cause.message : "sign_in_failed");
        }

        const { token } = await createSession(env, user.id, now);

        // Two Set-Cookie headers — the session is issued and the OAuth scratch is dropped.
        // Cookies are the one header that must not be folded into a comma-separated value,
        // so this appends rather than building an object literal.
        const headers = new Headers({ location: `${url.origin}/`, "cache-control": "no-store" });
        headers.append("set-cookie", sessionCookie(token, SESSION_TTL_S));
        headers.append("set-cookie", clearedOauthCookie());
        return new Response(null, { status: 302, headers });
      }

      default:
        return dispatch(env, request, url, now);
    }
  },
};

/**
 * Everything that needs a signed-in user. Ids are matched by shape, so a malformed one is a
 * 404 before it reaches the database rather than a query that was never going to match.
 */
const ID = "([A-Za-z0-9_-]{22})";

const ROUTES: Array<{ method: string; pattern: RegExp; handle: (ctx: Ctx, ...p: string[]) => Promise<Response> }> = [
  { method: "GET", pattern: new RegExp(`^/api/projects$`), handle: listProjects },
  { method: "POST", pattern: new RegExp(`^/api/projects$`), handle: createProject },
  { method: "PATCH", pattern: new RegExp(`^/api/projects/${ID}$`), handle: renameProject },
  { method: "DELETE", pattern: new RegExp(`^/api/projects/${ID}$`), handle: deleteProject },
  { method: "GET", pattern: new RegExp(`^/api/projects/${ID}/boards$`), handle: listBoards },
  { method: "POST", pattern: new RegExp(`^/api/projects/${ID}/boards$`), handle: createBoard },
  { method: "GET", pattern: new RegExp(`^/api/boards/${ID}$`), handle: getBoard },
  { method: "PUT", pattern: new RegExp(`^/api/boards/${ID}$`), handle: updateBoard },
  { method: "DELETE", pattern: new RegExp(`^/api/boards/${ID}$`), handle: deleteBoard },
];

async function dispatch(env: Env, request: Request, url: URL, now: number): Promise<Response> {
  for (const route of ROUTES) {
    const match = route.pattern.exec(url.pathname);
    if (!match || route.method !== request.method) continue;

    // Authenticated last, so an unknown path never costs a session lookup.
    const user = await resolveSession(env, request, now);
    if (!user) return fail("unauthorized", 401);

    return route.handle({ env, request, user, now }, ...match.slice(1));
  }
  return fail("not_found", 404);
}
