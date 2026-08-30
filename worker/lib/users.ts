/**
 * Resolving an external identity to an account.
 *
 * THE JOIN RULE. Lookup is by `(provider, subject)` first, because Google's `sub` is the only
 * stable handle — an address can change and the `sub` cannot. Only when that misses does email
 * come into it, and then it links rather than duplicates: signing in with Google using the
 * address of an existing password account attaches an identity to that account. Two accounts
 * for one person is the failure mode worth designing out, and it is only safe because the
 * caller has already refused an unverified email.
 */

import { newId } from "./crypto";
import type { GoogleIdentity } from "./google";
import type { SessionUser } from "./session";

export async function userForGoogleIdentity(
  env: Env,
  identity: GoogleIdentity,
  now: number,
): Promise<SessionUser> {
  const existing = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name
       FROM identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = 'google' AND i.subject = ?`,
  )
    .bind(identity.subject)
    .first<{ id: string; email: string; display_name: string | null }>();

  if (existing) {
    return { id: existing.id, email: existing.email, displayName: existing.display_name };
  }

  const byEmail = await env.DB.prepare(
    "SELECT id, email, display_name FROM users WHERE email = ?",
  )
    .bind(identity.email)
    .first<{ id: string; email: string; display_name: string | null }>();

  if (byEmail) {
    await env.DB.prepare(
      "INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)",
    )
      .bind(identity.subject, byEmail.id, now)
      .run();
    return { id: byEmail.id, email: byEmail.email, displayName: byEmail.display_name };
  }

  // New account. Batched so a user without an identity cannot survive a failure halfway —
  // that row would own boards nobody could ever sign in to reach.
  const id = newId();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, NULL, ?, ?)",
    ).bind(id, identity.email, identity.displayName, now),
    env.DB.prepare(
      "INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)",
    ).bind(identity.subject, id, now),
  ]);

  return { id, email: identity.email, displayName: identity.displayName };
}
