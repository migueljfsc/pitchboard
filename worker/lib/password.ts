/**
 * Storing and checking a password, on the server's side of the split (D109).
 *
 * WHAT ARRIVES IS NOT THE PASSWORD. The browser runs PBKDF2-SHA256 at 600,000 iterations over
 * it (`src/share/password.ts`) and sends the 256-bit result, the KEY. That work is what makes a
 * leaked table expensive to attack, and it cannot run here: measured on the edge, PBKDF2 costs
 * about 0.27 ms of CPU per thousand iterations, so the free tier's 10 ms buys roughly 30,000.
 *
 * WHAT IS STORED. An HMAC-SHA256 of the salted key, keyed by `PASSWORD_PEPPER` — a Worker
 * secret, held apart from the database. The key is uniform random bits, so a fast MAC is enough
 * to stop the stored value being replayed; the pepper means a leaked table alone cannot even
 * start a dictionary attack, and with it an attacker still pays the browser's 600,000
 * iterations per guess. The salt is per-row, so one password never stores the same value twice.
 *
 * FORMAT. `v2$<salt>$<mac>`, both base64url. `v1$<salt>$<sha256>` is the unpeppered original:
 * it still verifies, and is rewritten as v2 the next time its owner signs in (`stale`).
 *
 * LOSING THE PEPPER locks out every password: nothing that was stored can be checked again.
 * The way back is a password reset per account, which is why it is never rotated casually.
 */

import { base64url } from "./crypto";
import { timingSafeEqual } from "./google";

/** 32 bytes, base64url without padding — the only shape `deriveKey` produces. */
const KEY = /^[A-Za-z0-9_-]{43}$/;


export function isKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

const encoder = new TextEncoder();

async function sha256(salt: string, key: string): Promise<string> {
  const bytes = encoder.encode(`${salt}$${key}`);
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function mac(pepper: string, salt: string, key: string): Promise<string> {
  // An empty pepper would make this an unkeyed hash that still looks like v2. A missing secret
  // is a broken deploy, and it fails loudly rather than storing something weaker.
  if (!pepper) throw new Error("missing_pepper");
  const hmac = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", hmac, encoder.encode(`${salt}$${key}`));
  return base64url(new Uint8Array(bytes));
}

export async function hashKey(key: string, pepper: string): Promise<string> {
  const salt = base64url(crypto.getRandomValues(new Uint8Array(16)));
  return `v2$${salt}$${await mac(pepper, salt, key)}`;
}

/**
 * `ok` is false for anything that is not a well-formed row, including NULL — a Google-only
 * account has no password, and "no password" must never compare equal to anything. `stale`
 * says a matching row is in an older format and should be rewritten with `hashKey`.
 */
export async function verifyKey(
  key: string,
  stored: string | null,
  pepper: string,
): Promise<{ ok: boolean; stale: boolean }> {
  const [version, salt, expected] = (stored ?? "").split("$");
  if (!salt || !expected) return { ok: false, stale: false };
  if (version === "v2") return { ok: timingSafeEqual(await mac(pepper, salt, key), expected), stale: false };
  if (version === "v1") return { ok: timingSafeEqual(await sha256(salt, key), expected), stale: true };
  return { ok: false, stale: false };
}

/**
 * Lowercased and trimmed, or null.
 *
 * Deliberately loose: the only proof an address works is the email that reaches it, so this
 * rejects what is plainly not an address and leaves the rest to the verification link. 254 is
 * the longest address SMTP will carry.
 */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
