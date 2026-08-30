/**
 * Google sign-in, authorization-code flow with a server-side exchange.
 *
 * WHY THIS SHAPE. The free tier allows 10 ms of CPU per request, and a password KDF is the
 * only part of signing in that spends it. This flow spends almost none: the code exchange is
 * a `fetch`, which is I/O and does not count, and the identity that comes back is a JWT whose
 * payload is one base64 decode and one JSON.parse.
 *
 * WHY THE SIGNATURE IS NOT VERIFIED. The ID token is not accepted from the browser; it is
 * read from the body of a direct HTTPS response from Google's token endpoint, authenticated
 * with the client secret. Google documents that a token obtained this way needs no local
 * signature check — the TLS channel is the proof. `aud` and `iss` are still checked, because
 * they cost microseconds and catch a misconfiguration rather than an attack.
 *
 * The frontend flow, where the browser hands over an ID token, would require verifying RS256
 * against Google's JWKS. That is affordable too, but there is no reason to take it on.
 */

import { newSessionToken, tokenDigest } from "./crypto";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Ten minutes: long enough for a slow consent screen, short enough to bound a stolen state. */
export const OAUTH_STATE_TTL_S = 600;
export const OAUTH_COOKIE = "pb_oauth";

export interface GoogleIdentity {
  subject: string;
  email: string;
  displayName: string | null;
}

/** The callback address is derived from the request rather than configured, so the same */
/** code works on workers.dev and on a custom domain without another secret to keep in sync. */
export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export async function authorizeUrl(
  clientId: string,
  origin: string,
  state: string,
  verifier: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    // Only what identifies the person. Nothing here is a sensitive scope, which is what
    // keeps the consent screen out of Google's verification review.
    scope: "openid email profile",
    state,
    // PKCE. Not strictly required for a confidential client that holds a secret, but it
    // costs one SHA-256 and removes the stolen-code class of attack entirely.
    code_challenge: await tokenDigest(verifier),
    code_challenge_method: "S256",
    // Without this a returning user is bounced straight through, which is usually right —
    // but it also means a revoked grant never re-prompts.
    prompt: "select_account",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  id_token?: string;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
}

/**
 * A JWT payload is base64url-encoded UTF-8, so it cannot go through `atob` alone — an
 * accented display name would arrive mangled.
 */
export function decodeJwtPayload(jwt: string): unknown {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("malformed_id_token");
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * `email_verified` is load-bearing, not a formality. Email is the key that joins a Google
 * identity to an existing password account, so accepting an unverified address would let
 * anyone who can make Google emit one take over the account it names.
 */
export function identityFromClaims(claims: unknown, clientId: string): GoogleIdentity {
  const c = claims as IdTokenClaims;
  if (!c.iss || !ISSUERS.includes(c.iss)) throw new Error("bad_issuer");
  if (c.aud !== clientId) throw new Error("bad_audience");
  if (!c.sub) throw new Error("missing_subject");
  if (!c.email) throw new Error("missing_email");
  // Google sends a boolean, but the claim is specified as possibly-stringified.
  if (c.email_verified !== true && c.email_verified !== "true") throw new Error("email_unverified");

  return {
    subject: c.sub,
    email: c.email.toLowerCase(),
    displayName: c.name ?? null,
  };
}

export async function exchangeCode(
  env: Env,
  code: string,
  origin: string,
  verifier: string,
): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
    }),
  });

  if (!response.ok) throw new Error("token_exchange_failed");

  const body = (await response.json()) as TokenResponse;
  if (!body.id_token) throw new Error("missing_id_token");

  return identityFromClaims(decodeJwtPayload(body.id_token), env.GOOGLE_CLIENT_ID);
}

/**
 * The state and the PKCE verifier have to survive the trip to Google and back, and there is
 * nowhere to put them but the browser. A cookie, not a KV write: this is per-attempt scratch
 * that expires in ten minutes, and KV allows only 1,000 writes a day on the free tier — one
 * per abandoned sign-in would be a budget spent on nothing.
 *
 * `SameSite=Lax` is required rather than preferred here. The callback arrives as a top-level
 * GET navigation from accounts.google.com, and `Strict` would withhold the cookie on exactly
 * that request, so every sign-in would fail its state check.
 */
export function oauthCookie(state: string, verifier: string): string {
  return `${OAUTH_COOKIE}=${state}.${verifier}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=${OAUTH_STATE_TTL_S}`;
}

export function clearedOauthCookie(): string {
  return `${OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Both halves are base64url, so the dot cannot occur inside either. */
export function parseOauthCookie(value: string | null): { state: string; verifier: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  return { state: value.slice(0, dot), verifier: value.slice(dot + 1) };
}

export function newOauthChallenge(): { state: string; verifier: string } {
  return { state: newSessionToken(), verifier: newSessionToken() };
}

/**
 * Length-independent only for equal-length inputs, which is all that is compared here: both
 * sides are 43-character base64url. The early length return leaks nothing an attacker does
 * not already control.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
