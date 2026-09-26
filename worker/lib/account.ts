/**
 * Deleting an account, and everything it owns (GDPR art. 17; D110).
 *
 * Every table that names a user is emptied by name, in one batch — one D1 transaction, so an
 * account is gone or untouched, never half-deleted. The `users` row goes last, and its
 * `ON DELETE CASCADE` foreign keys are the backstop for a table added later and forgotten
 * here — but the list is the contract, and a new table that stores anything about a person
 * belongs in it.
 *
 * `email_tokens` has no foreign key (a verify token names an address before its account
 * exists), so the address is cleared from it explicitly; without that, a pending reset link
 * would outlive the account it was for.
 *
 * Share links need nothing extra: a published board is the board row itself (D7), so its
 * `/share/<slug>` stops resolving the moment the row is gone.
 */

import { fail, json } from "./http";
import { clearedSessionCookie, type SessionUser } from "./session";

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The request must repeat the account's address. The UI asks the coach to type it, and the
 * server checks it rather than trusting the button: an irreversible delete should not be one
 * stray request away. A cross-site page cannot send this at all — a DELETE with a JSON body
 * needs a CORS preflight this Worker never grants, and the SameSite=Lax cookie is withheld.
 */
export async function deleteAccount(env: Env, request: Request, user: SessionUser): Promise<Response> {
  const { confirm } = await body(request);
  if (typeof confirm !== "string" || confirm.trim().toLowerCase() !== user.email) {
    return fail("confirmation_mismatch", 400);
  }

  const id = user.id;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM presets WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM boards WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM projects WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM identities WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM email_tokens WHERE email = ?").bind(user.email),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);

  return json({ ok: true }, 200, { "set-cookie": clearedSessionCookie() });
}
