/**
 * Hand-drawn formations — the library a team's shape is picked from (D122).
 *
 * The same rules as `presets.ts`, and its checks: ownership is a WHERE clause, and the body is
 * stored opaquely, checked only for size and well-formedness. `src/share/formationLibrary.ts`
 * owns the schema and validates in the browser, where a shape also arrives from `localStorage`.
 * Small and capped, so the list returns the bodies too.
 */

import { fail, json } from "./http";
import { newId } from "./crypto";
import { MAX_FORMATIONS_PER_USER, MAX_FORMATION_NAME_CHARS } from "./limits";
import { cleanBody } from "./presets";
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
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length === 0 || name.length > MAX_FORMATION_NAME_CHARS ? null : name;
}

/** Oldest first, the id breaking ties, so the picker keeps the order they were drawn in. */
export async function listFormations({ env, user }: Ctx): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, body, created_at, updated_at
       FROM formations WHERE user_id = ?
      ORDER BY created_at, id`,
  )
    .bind(user.id)
    .all();
  return json({ formations: results });
}

export async function createFormation(ctx: Ctx): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  const shape = cleanBody(payload?.body);
  if (!name) return fail("invalid_name", 400);
  if (shape === null) return fail("invalid_formation", 400);

  const row = await ctx.env.DB.prepare("SELECT count(*) n FROM formations WHERE user_id = ?")
    .bind(ctx.user.id)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= MAX_FORMATIONS_PER_USER) return fail("formation_limit_reached", 409);

  const id = newId();
  await ctx.env.DB.prepare(
    `INSERT INTO formations (id, user_id, name, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ctx.user.id, name, shape, ctx.now, ctx.now)
    .run();
  return json({ formation: { id, name, body: shape, created_at: ctx.now, updated_at: ctx.now } }, 201);
}

/** A whole update — name and shape — for a rename and for re-saving over the same name. */
export async function saveFormation(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  const shape = cleanBody(payload?.body);
  if (!name) return fail("invalid_name", 400);
  if (shape === null) return fail("invalid_formation", 400);

  const result = await ctx.env.DB.prepare(
    "UPDATE formations SET name = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  )
    .bind(name, shape, ctx.now, id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ formation: { id, name, body: shape, updated_at: ctx.now } });
}

export async function deleteFormation(ctx: Ctx, id: string): Promise<Response> {
  const result = await ctx.env.DB.prepare("DELETE FROM formations WHERE id = ? AND user_id = ?")
    .bind(id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ ok: true });
}
