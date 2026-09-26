/**
 * Email and password sign-in (D109).
 *
 * THE SHAPE. Registering never creates an account. It stores the password's hash on a
 * single-use token and emails a link; the account is written when the link comes back. So an
 * unverified account never exists, and an address with a password has been proved by whoever
 * reads its mail — which is what lets users.ts join a Google sign-in to it by email.
 *
 * REGISTERING AN ADDRESS THAT HAS AN ACCOUNT is not an error. The link sets the password on
 * that account: for a Google-only account that is how a password is added, and for one that
 * already has a password it is a reset by another route. Either way only the owner of the
 * mailbox can complete it, and the response cannot tell a stranger which case it was.
 *
 * NOTHING HERE ANSWERS "DOES THIS ADDRESS HAVE AN ACCOUNT". Register and reset-request reply
 * `{ ok: true }` before anything is sent, and the send happens in `waitUntil`, so neither the
 * body nor the timing differs. Sign-in says only "wrong email or password".
 *
 * CPU. Nothing here is expensive — the KDF ran in the browser — so every handler is a few
 * SHA-256s, a Turnstile `fetch` and D1 round trips, all well inside 10 ms.
 */

import { newId, newSessionToken, tokenDigest } from "./crypto";
import { fail, json } from "./http";
import { composeMail, mailLang, sendMail } from "./mail";
import { hashKey, isKey, normaliseEmail, verifyKey } from "./password";
import { createSession, sessionCookie, SESSION_TTL_S } from "./session";
import { passesTurnstile } from "./turnstile";

/** Long enough to reach an inbox that is only checked in the evening. */
export const VERIFY_TTL_S = 24 * 60 * 60;
/** Short, because a reset link in an old email is a way into the account. */
export const RESET_TTL_S = 60 * 60;

type Purpose = "verify" | "reset";

export interface AuthCtx {
  env: Env;
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
  origin: string;
  now: number;
}

/**
 * JSON only, by content type and not just by parse. A cross-site form can POST a JSON-shaped
 * body as `text/plain` without a preflight, and sign-in setting a cookie makes that a login
 * CSRF: the victim ends up in the attacker's account, saving boards into it. `application/json`
 * cannot be sent cross-site without a CORS preflight, which this Worker never grants.
 */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return {};
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Keyed by route and by client, and separately by route and address: the first stops one
 * machine trying many accounts, the second many machines trying one. The limiter is per
 * Cloudflare location and eventually consistent, which is enough to make guessing slow.
 */
async function limited(env: Env, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    const { success } = await env.AUTH_LIMIT.limit({ key });
    if (!success) return true;
  }
  return false;
}

function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

/**
 * One live link per address and purpose: issuing a new one deletes the old, so only the most
 * recent email works. Expired rows anywhere go on the same statement, which is the whole
 * cleanup story — the same as sessions, with no cron.
 */
async function issueToken(
  ctx: AuthCtx,
  purpose: Purpose,
  email: string,
  passwordHash: string | null,
): Promise<string> {
  const { env, now } = ctx;
  const token = newSessionToken();
  const ttl = purpose === "verify" ? VERIFY_TTL_S : RESET_TTL_S;
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM email_tokens WHERE (email = ?1 AND purpose = ?2) OR expires_at <= ?3",
    ).bind(email, purpose, now),
    env.DB.prepare(
      `INSERT INTO email_tokens (id, purpose, email, password_hash, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(await tokenDigest(token), purpose, email, passwordHash, now, now + ttl),
  ]);
  return token;
}

/** Single use: the row is deleted by the statement that reads it, so a replay finds nothing. */
async function consumeToken(
  ctx: AuthCtx,
  purpose: Purpose,
  token: unknown,
): Promise<{ email: string; password_hash: string | null } | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await ctx.env.DB.prepare(
    `DELETE FROM email_tokens WHERE id = ? AND purpose = ?
     RETURNING email, password_hash, expires_at`,
  )
    .bind(await tokenDigest(token), purpose)
    .first<{ email: string; password_hash: string | null; expires_at: number }>();
  if (!row || row.expires_at <= ctx.now) return null;
  return row;
}

/**
 * Installs a password and signs in. Every other session on the account is ended: a password
 * set by link is either a new credential or a replaced one, and whoever held the old one
 * should not keep a session it opened.
 */
async function setPasswordAndSignIn(ctx: AuthCtx, email: string, passwordHash: string) {
  const { env, now } = ctx;
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  let userId: string;
  if (existing) {
    userId = existing.id;
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    ]);
  } else {
    userId = newId();
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, NULL, ?)",
    )
      .bind(userId, email, passwordHash, now)
      .run();
  }

  return signedIn(env, userId, now);
}

async function signedIn(env: Env, userId: string, now: number): Promise<Response> {
  const { token } = await createSession(env, userId, now);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, SESSION_TTL_S) });
}

function mail(ctx: AuthCtx, to: string, purpose: Purpose, lang: unknown, link: string): void {
  ctx.waitUntil(
    sendMail(ctx.env, to, composeMail(purpose, mailLang(lang), link)).catch((cause: unknown) => {
      console.error("mail", purpose, cause instanceof Error ? cause.message : cause);
    }),
  );
}

export async function register(ctx: AuthCtx): Promise<Response> {
  const body = await readBody(ctx.request);
  const email = normaliseEmail(body.email);
  if (!email || !isKey(body.key)) return fail("invalid_request", 400);

  const ip = clientIp(ctx.request);
  if (await limited(ctx.env, [`register:ip:${ip}`, `register:email:${email}`])) {
    return fail("rate_limited", 429);
  }
  if (!(await passesTurnstile(ctx.env, body.turnstile, ip))) return fail("captcha_failed", 400);

  const token = await issueToken(ctx, "verify", email, await hashKey(body.key));
  mail(ctx, email, "verify", body.lang, `${ctx.origin}/?verify=${token}`);
  return json({ ok: true });
}

export async function verifyEmail(ctx: AuthCtx): Promise<Response> {
  const body = await readBody(ctx.request);
  const row = await consumeToken(ctx, "verify", body.token);
  if (!row?.password_hash) return fail("invalid_token", 400);
  return setPasswordAndSignIn(ctx, row.email, row.password_hash);
}

export async function login(ctx: AuthCtx): Promise<Response> {
  const body = await readBody(ctx.request);
  const email = normaliseEmail(body.email);
  if (!email || !isKey(body.key)) return fail("invalid_credentials", 401);

  const ip = clientIp(ctx.request);
  if (await limited(ctx.env, [`login:ip:${ip}`, `login:email:${email}`])) {
    return fail("rate_limited", 429);
  }

  const user = await ctx.env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string | null }>();

  // A missing account and a wrong password are one answer, and cost the same: `verifyKey`
  // hashes before it compares, and a missing row still pays for the hash.
  const ok = await verifyKey(body.key, user?.password_hash ?? "v1$missing$missing");
  if (!user || !ok) return fail("invalid_credentials", 401);

  return signedIn(ctx.env, user.id, ctx.now);
}

export async function requestReset(ctx: AuthCtx): Promise<Response> {
  const body = await readBody(ctx.request);
  const email = normaliseEmail(body.email);
  if (!email) return fail("invalid_request", 400);

  const ip = clientIp(ctx.request);
  if (await limited(ctx.env, [`reset:ip:${ip}`, `reset:email:${email}`])) {
    return fail("rate_limited", 429);
  }
  if (!(await passesTurnstile(ctx.env, body.turnstile, ip))) return fail("captcha_failed", 400);

  // Only an address with an account gets mail: a reset link to a stranger is spam with this
  // site's name on it. The lookup and the send both run after the response, so the timing of
  // the reply does not depend on the answer.
  const { env, origin } = ctx;
  ctx.waitUntil(
    (async () => {
      const user = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
      if (!user) return;
      const token = await issueToken(ctx, "reset", email, null);
      const link = `${origin}/?reset=${token}&email=${encodeURIComponent(email)}`;
      await sendMail(env, email, composeMail("reset", mailLang(body.lang), link));
    })().catch((cause: unknown) => {
      console.error("mail", "reset", cause instanceof Error ? cause.message : cause);
    }),
  );
  return json({ ok: true });
}

/**
 * The email is sent with the new key rather than looked up from the token alone, because the
 * browser salted the key with the address it believed it was resetting. If the two disagree
 * the key would never log in, so the reset is refused rather than installing it.
 */
export async function resetPassword(ctx: AuthCtx): Promise<Response> {
  const body = await readBody(ctx.request);
  const email = normaliseEmail(body.email);
  if (!email || !isKey(body.key)) return fail("invalid_request", 400);

  const row = await consumeToken(ctx, "reset", body.token);
  if (!row || row.email !== email) return fail("invalid_token", 400);

  const user = await ctx.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (!user) return fail("invalid_token", 400);

  return setPasswordAndSignIn(ctx, email, await hashKey(body.key));
}
