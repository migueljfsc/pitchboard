/**
 * Random identifiers and hashing, on the Workers runtime's WebCrypto.
 *
 * Nothing here is a password KDF. Password hashing is deliberately expensive and lives with
 * the auth endpoints, where its cost is measured against the free tier's 10 ms CPU budget.
 * These are the cheap primitives: 128 bits of randomness for an id, 256 for a session token,
 * and one SHA-256 for turning a token into the key it is stored under.
 */

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // Padding is stripped so the value is safe in a cookie, where `=` separates name from value.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 128 bits, for rows the user never sees: users, projects, boards, snapshots. */
export function newId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * 256 bits, for the session cookie. This is a bearer credential — it is the only thing
 * standing between a stranger and an account, so it gets twice the entropy of an id and is
 * never derived from anything guessable.
 */
export function newSessionToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * The key a session token is stored under. The database holds this, never the token itself,
 * so a leaked copy of `sessions` yields nothing that can be replayed: inverting SHA-256 over
 * 256 bits of uniform randomness is not a dictionary attack, it is a preimage attack.
 */
export async function tokenDigest(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64url(new Uint8Array(digest));
}
