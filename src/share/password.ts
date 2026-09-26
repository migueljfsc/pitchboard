/**
 * Turning a password into what the server sees (D109).
 *
 * The expensive half of password hashing runs HERE, not in the Worker: PBKDF2-SHA256 at
 * 600,000 iterations (OWASP's figure) costs ~0.27 ms of edge CPU per thousand, and the free
 * tier allows 10 ms a request. The browser has no such limit and WebCrypto runs it natively,
 * so a laptop pays tens of milliseconds and a phone a few hundred. The Worker stores a salted
 * SHA-256 of the result, so a leaked table still costs 600,000 iterations per guess.
 *
 * THE SALT IS THE ADDRESS, as Bitwarden does it. It has to be something the browser knows
 * before asking the server anything — a salt fetched per account would need an endpoint that
 * answers "does this address exist". It only has to be unique per account and per site, and a
 * prefix makes it this site's.
 *
 * EVERY CONSTANT HERE IS LOAD-BEARING. Changing the iterations, the prefix or the
 * normalisation derives a different key from the same password, and every account stops
 * signing in. Raising the work factor needs a version the server can report first.
 */

export const PBKDF2_ITERATIONS = 600_000;
const SALT_PREFIX = "pitchboard:v1:";

/** NIST's floor. No composition rules, and no ceiling a passphrase would hit. */
export const MIN_PASSWORD = 8;

/** Must match `normaliseEmail` in `worker/lib/password.ts`, or the salts differ. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function deriveKey(email: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    // NFC so a password typed with a composed "é" and one with "e" + accent are the same.
    encoder.encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(SALT_PREFIX + normaliseEmail(email)),
      iterations: PBKDF2_ITERATIONS,
    },
    material,
    256,
  );
  return base64url(new Uint8Array(bits));
}
