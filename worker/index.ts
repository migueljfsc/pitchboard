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
  NEXT_COOKIE,
  clearedNextCookie,
  nextCookie,
  parseOauthCookie,
  safeNext,
  timingSafeEqual,
} from "./lib/google";
import {
  copyBoard,
  createBoard,
  createProject,
  deleteBoard,
  deleteBoards,
  deleteProject,
  getBoard,
  listAllBoards,
  listBoards,
  listProjects,
  moveBoard,
  moveBoards,
  renameProject,
  updateBoard,
  type Ctx,
} from "./lib/boards";
import {
  createPreset,
  deletePreset,
  listPresets,
  savePreset,
} from "./lib/presets";
import { fail, json } from "./lib/http";
import { publishBoard, readShare, unpublishBoard } from "./lib/shares";
import { SLUG_LENGTH } from "./lib/limits";
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
  const headers = new Headers({ location: url, "cache-control": "no-store" });
  headers.append("set-cookie", clearedOauthCookie());
  headers.append("set-cookie", clearedNextCookie());
  return new Response(null, { status: 302, headers });
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
        // Where the user was when they clicked sign in — a deep link to a saved board has to
        // survive the round trip through Google, or signing in to open a board drops you on a
        // blank one instead.
        const next = safeNext(url.searchParams.get("next"));
        const headers = new Headers({
          location: await authorizeUrl(env.GOOGLE_CLIENT_ID, url.origin, state, verifier),
          "cache-control": "no-store",
        });
        headers.append("set-cookie", oauthCookie(state, verifier));
        headers.append("set-cookie", nextCookie(next));
        return new Response(null, { status: 302, headers });
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
        // `?welcome=1` marks a sign-in that has JUST happened, which the client cannot work
        // out for itself: after the redirect the page loads fresh, and a returning visitor
        // with a thirty-day cookie looks identical to someone who signed in a second ago.
        // It is what lets the offer to save the local board appear once rather than nag.
        //
        // The cookie is re-validated rather than trusted: it is the browser's copy of a value
        // this Worker wrote, and browser storage is not a trusted channel.
        const next = safeNext(
          decodeURIComponent(readCookie(request.headers.get("cookie"), NEXT_COOKIE) ?? ""),
        );
        const separator = next.includes("?") ? "&" : "?";
        const headers = new Headers({
          location: `${url.origin}${next}${separator}welcome=1`,
          "cache-control": "no-store",
        });
        headers.append("set-cookie", sessionCookie(token, SESSION_TTL_S));
        headers.append("set-cookie", clearedOauthCookie());
        headers.append("set-cookie", clearedNextCookie());
        return new Response(null, { status: 302, headers });
      }

      default:
        return (await publicRoute(env, request, url)) ?? (await dispatch(env, request, url, now));
    }
  },
};

/**
 * Everything that needs a signed-in user. Ids are matched by shape, so a malformed one is a
 * 404 before it reaches the database rather than a query that was never going to match.
 */
const ID = "([A-Za-z0-9_-]{22})";
const SLUG = `([2-9bcdfghjkmnpqrstvwxz]{${SLUG_LENGTH}})`;

/**
 * The unauthenticated surface, checked before anything that needs a session. Exactly one
 * route: reading a published board. Everything else answers 401 to a stranger.
 */
const SHARE_ROUTE = new RegExp(`^/api/shares/${SLUG}$`);

async function publicRoute(env: Env, request: Request, url: URL): Promise<Response | null> {
  const match = SHARE_ROUTE.exec(url.pathname);
  if (!match || request.method !== "GET") return null;
  return readShare(env, match[1]);
}

const ROUTES: Array<{ method: string; pattern: RegExp; handle: (ctx: Ctx, ...p: string[]) => Promise<Response> }> = [
  { method: "GET", pattern: new RegExp(`^/api/projects$`), handle: listProjects },
  { method: "POST", pattern: new RegExp(`^/api/projects$`), handle: createProject },
  { method: "PATCH", pattern: new RegExp(`^/api/projects/${ID}$`), handle: renameProject },
  { method: "DELETE", pattern: new RegExp(`^/api/projects/${ID}$`), handle: deleteProject },
  { method: "GET", pattern: new RegExp(`^/api/projects/${ID}/boards$`), handle: listBoards },
  { method: "POST", pattern: new RegExp(`^/api/projects/${ID}/boards$`), handle: createBoard },
  { method: "GET", pattern: new RegExp(`^/api/boards$`), handle: listAllBoards },
  { method: "PATCH", pattern: new RegExp(`^/api/boards$`), handle: moveBoards },
  { method: "DELETE", pattern: new RegExp(`^/api/boards$`), handle: deleteBoards },
  { method: "GET", pattern: new RegExp(`^/api/boards/${ID}$`), handle: getBoard },
  { method: "PUT", pattern: new RegExp(`^/api/boards/${ID}$`), handle: updateBoard },
  { method: "PATCH", pattern: new RegExp(`^/api/boards/${ID}$`), handle: moveBoard },
  { method: "POST", pattern: new RegExp(`^/api/boards/${ID}/copy$`), handle: copyBoard },
  { method: "DELETE", pattern: new RegExp(`^/api/boards/${ID}$`), handle: deleteBoard },
  { method: "POST", pattern: new RegExp(`^/api/boards/${ID}/publish$`), handle: publishBoard },
  { method: "DELETE", pattern: new RegExp(`^/api/boards/${ID}/publish$`), handle: unpublishBoard },
  { method: "GET", pattern: new RegExp(`^/api/presets$`), handle: listPresets },
  { method: "POST", pattern: new RegExp(`^/api/presets$`), handle: createPreset },
  { method: "PUT", pattern: new RegExp(`^/api/presets/${ID}$`), handle: savePreset },
  { method: "DELETE", pattern: new RegExp(`^/api/presets/${ID}$`), handle: deletePreset },
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
