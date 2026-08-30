/**
 * Sessions: the cookie, the row it points at, and the rules for both.
 *
 * WHY THIS IS NOT REDIS (D39). The obvious worry is that signing in is expensive and should
 * therefore be done once, with a fast store keeping the session warm afterwards. The premise
 * is half right. Cloudflare's free tier allows 10 ms of CPU per request, and the limits
 * documentation is explicit that "waiting on network requests (such as fetch() calls, KV
 * reads, or database queries) does not count toward CPU time". Session lookup was never
 * spending the budget — a password KDF at sign-in is. So a session check costs one SHA-256
 * of a 43-character token plus a primary-key lookup, and adding a third-party store would
 * buy a subrequest and another free tier to watch over a problem it does not touch.
 *
 * WHAT IS STORED. The cookie carries 256 bits of randomness; the database stores its SHA-256
 * and never the token. `sessions.id` is that digest, so the lookup and the credential check
 * are the same operation.
 */

import { newSessionToken, tokenDigest } from "./crypto";

export const SESSION_COOKIE = "pb_session";

/** Thirty days. Long enough that signing in is rare, short enough to bound a stolen cookie. */
export const SESSION_TTL_S = 30 * 24 * 60 * 60;

/**
 * How stale a session may get before its expiry is pushed out again.
 *
 * Renewing on every request would mean a database write per request, which is both the wrong
 * shape and a direct route through the free tier's 100,000 row writes per day. Renewing only
 * once the session has lost more than a day of life caps it at one write per session per day,
 * while still meaning an account in daily use never has to sign in again.
 */
export const SESSION_SLIDE_AFTER_S = 24 * 60 * 60;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface SessionRow {
  expires_at: number;
  id: string;
  email: string;
  display_name: string | null;
}

/** Pure, so the arithmetic is testable without a database. */
export function shouldRenew(expiresAt: number, now: number): boolean {
  return expiresAt - now < SESSION_TTL_S - SESSION_SLIDE_AFTER_S;
}

/**
 * Reads one cookie out of a Cookie header.
 *
 * Hand-rolled rather than pulled from a package: the header is a `; `-separated list and the
 * value here is base64url with its padding stripped, so there is nothing to unquote or
 * percent-decode. Only the first `=` splits, because a value is allowed to contain more.
 */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * `SameSite=Lax` rather than `Strict`: the cookie must survive a share link opened from
 * somewhere else, which is a top-level navigation. It is still withheld from cross-site
 * POSTs, which is the case CSRF cares about.
 */
export function sessionCookie(token: string, maxAgeS: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}

export async function createSession(
  env: Env,
  userId: string,
  now: number,
): Promise<{ token: string; expiresAt: number }> {
  const token = newSessionToken();
  const expiresAt = now + SESSION_TTL_S;
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await tokenDigest(token), userId, now, expiresAt)
    .run();
  return { token, expiresAt };
}

/**
 * The signed-in user, or null. Expired rows are deleted on the way past rather than swept:
 * a session is only ever found by the person holding its token, so the row that needs
 * collecting is exactly the row being looked at. That is the whole cleanup story, and it
 * costs no cron trigger and no scheduled CPU.
 */
export async function resolveSession(
  env: Env,
  request: Request,
  now: number,
): Promise<SessionUser | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;

  const id = await tokenDigest(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.id, u.email, u.display_name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(id)
    .first<SessionRow>();

  if (!row) return null;

  if (row.expires_at <= now) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }

  if (shouldRenew(row.expires_at, now)) {
    // Awaited rather than deferred: it happens at most once a day per session, and a
    // background write that loses a race would silently sign someone out a month later.
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(now + SESSION_TTL_S, id)
      .run();
  }

  return { id: row.id, email: row.email, displayName: row.display_name };
}

/** Signing out destroys the session for every device holding that token, which is one. */
export async function destroySession(env: Env, request: Request): Promise<void> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await tokenDigest(token)).run();
}
