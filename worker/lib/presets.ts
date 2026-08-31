/**
 * Squad presets — the library a board draws its XIs from (D30).
 *
 * The same two rules as `boards.ts`, for the same reasons.
 *
 * OWNERSHIP IS A WHERE CLAUSE. Every statement filters on `user_id` beside the row id, so a
 * forgotten comparison cannot hand somebody else's squad over. "Not yours" and "not there"
 * are the same 404, which is the right answer to a prober anyway.
 *
 * THE BODY IS NOT SCHEMA-VALIDATED HERE. `src/share/presets.ts` owns `presetSchema` and runs
 * it in the browser, where it has to run regardless: a preset also arrives from
 * `localStorage`, which no server ever sees (D31). Size and well-formedness are checked,
 * because storing something the client cannot parse loses the squad.
 *
 * A preset is small and there are at most fifty, so the list route returns the bodies too —
 * unlike boards, where the documents are the large part and a listing leaves them behind.
 * Fetching a library is one request; the alternative is fifty.
 */

import { fail, json } from "./http";
import { newId } from "./crypto";
import { MAX_PRESETS_PER_USER, MAX_PRESET_BYTES, MAX_PRESET_LABEL_CHARS } from "./limits";
import type { Ctx } from "./boards";

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Trimmed before it is measured, so padding does not eat the budget. */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (label.length === 0 || label.length > MAX_PRESET_LABEL_CHARS) return null;
  return label;
}

/**
 * Byte length, not character length: the cap protects the database, and a squad of accented
 * names is longer in bytes than in characters.
 */
export function cleanBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (new TextEncoder().encode(value).byteLength > MAX_PRESET_BYTES) return null;
  try {
    JSON.parse(value);
  } catch {
    return null;
  }
  return value;
}

/**
 * The whole library, oldest first.
 *
 * Order is load-bearing in a way a board list's is not: the client replaces a preset in
 * place to keep it where it was in the picker, so the order the rows come back in is the
 * order the coach put them in. `created_at` alone is not a total order — two presets saved
 * inside one second would swap between reads — so the id breaks the tie.
 */
export async function listPresets({ env, user }: Ctx): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, label, body, created_at, updated_at
       FROM presets WHERE user_id = ?
      ORDER BY created_at, id`,
  )
    .bind(user.id)
    .all();
  return json({ presets: results });
}

export async function createPreset(ctx: Ctx): Promise<Response> {
  const payload = await body(ctx.request);
  const label = cleanLabel(payload?.label);
  const doc = cleanBody(payload?.body);
  if (!label) return fail("invalid_name", 400);
  if (doc === null) return fail("invalid_preset", 400);

  const row = await ctx.env.DB.prepare("SELECT count(*) n FROM presets WHERE user_id = ?")
    .bind(ctx.user.id)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= MAX_PRESETS_PER_USER) return fail("preset_limit_reached", 409);

  const id = newId();
  await ctx.env.DB.prepare(
    `INSERT INTO presets (id, user_id, label, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ctx.user.id, label, doc, ctx.now, ctx.now)
    .run();

  return json(
    { preset: { id, label, body: doc, created_at: ctx.now, updated_at: ctx.now } },
    201,
  );
}

/**
 * A whole update — both the name and the squad.
 *
 * There is no partial form, because the two things that write here are renaming a preset and
 * re-saving a squad under a name it already has, and the client holds the whole preset in
 * both cases. A PATCH would buy a few hundred bytes on the wire in exchange for a route that
 * has to say what an absent field means.
 *
 * No version and no conflict: a preset is one squad, replaced whole. Two devices editing the
 * same one is the case a version would catch, and there is nothing to merge when they do —
 * unlike a board, where a lost write is an afternoon's work.
 */
export async function savePreset(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const label = cleanLabel(payload?.label);
  const doc = cleanBody(payload?.body);
  if (!label) return fail("invalid_name", 400);
  if (doc === null) return fail("invalid_preset", 400);

  const result = await ctx.env.DB.prepare(
    "UPDATE presets SET label = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  )
    .bind(label, doc, ctx.now, id, ctx.user.id)
    .run();

  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ preset: { id, label, body: doc, updated_at: ctx.now } });
}

export async function deletePreset(ctx: Ctx, id: string): Promise<Response> {
  const result = await ctx.env.DB.prepare("DELETE FROM presets WHERE id = ? AND user_id = ?")
    .bind(id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ ok: true });
}
