/**
 * Storing and checking a password, on the server's side of the split (D109).
 *
 * WHAT ARRIVES IS NOT THE PASSWORD. The browser runs PBKDF2-SHA256 at 600,000 iterations over
 * it (`src/share/password.ts`) and sends the 256-bit result, the KEY. That work is what makes a
 * leaked table expensive to attack, and it cannot run here: measured on the edge, PBKDF2 costs
 * about 0.27 ms of CPU per thousand iterations, so the free tier's 10 ms buys roughly 30,000.
 *
 * WHAT IS STORED. One salted SHA-256 of the key. The key is uniform random bits, so a fast hash
 * is enough to stop the stored value being replayed — the key itself is what logs in, and a
 * dictionary attack on the stored value still has to pay the browser's 600,000 iterations per
 * guess. The salt is per-row so two accounts with one password do not share a stored value.
 *
 * FORMAT. `v1$<salt>$<digest>`, both base64url. The version is there so the scheme can change
 * without a migration: a row keeps verifying against its own version.
 */

import { base64url } from "./crypto";
import { timingSafeEqual } from "./google";

/** 32 bytes, base64url without padding — the only shape `deriveKey` produces. */
const KEY = /^[A-Za-z0-9_-]{43}$/;

const VERSION = "v1";

export function isKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

async function digest(salt: string, key: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}$${key}`);
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function hashKey(key: string): Promise<string> {
  const salt = base64url(crypto.getRandomValues(new Uint8Array(16)));
  return `${VERSION}$${salt}$${await digest(salt, key)}`;
}

/**
 * False for anything that is not a well-formed v1 row, including NULL — a Google-only account
 * has no password, and "no password" must never compare equal to anything.
 */
export async function verifyKey(key: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [version, salt, expected] = stored.split("$");
  if (version !== VERSION || !salt || !expected) return false;
  return timingSafeEqual(await digest(salt, key), expected);
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
