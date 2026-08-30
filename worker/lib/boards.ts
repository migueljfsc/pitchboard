/**
 * Projects and boards — the mutable half of the data model (D39).
 *
 * OWNERSHIP IS A WHERE CLAUSE, NOT A CHECK. Every statement here filters on `user_id`
 * alongside the row id. Fetching first and comparing afterwards is the same query written so
 * that forgetting the comparison still returns the row; this way a missing filter cannot
 * silently hand someone else's board over. The cost is that "not yours" and "not there" are
 * indistinguishable, which is the right answer anyway — a 404 tells a prober nothing.
 *
 * THE DOCUMENT IS NOT SCHEMA-VALIDATED HERE, deliberately. `src/board/schema.ts` is the one
 * validator and it runs in the browser, on every load, after migration — which is where it
 * has to run regardless, because a board can arrive from localStorage or a share link with no
 * server involved (D31). Re-running it in the Worker would put a zod parse of a large document
 * inside a 10 ms CPU budget to protect a user from their own data. Well-formedness and size
 * are checked, because storing something the client cannot parse loses the board.
 */

import { fail, json } from "./http";
import { newId } from "./crypto";
import {
  MAX_BOARDS_PER_USER,
  MAX_DOC_BYTES,
  MAX_NAME_CHARS,
  MAX_PROJECTS_PER_USER,
} from "./limits";
import { purgeSnapshotsFor } from "./shares";
import type { SessionUser } from "./session";

export interface Ctx {
  env: Env;
  request: Request;
  user: SessionUser;
  now: number;
}

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

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_CHARS) return null;
  return name;
}

/**
 * Byte length, not character length: the cap protects the database and the response, and a
 * board full of accented player names is longer in bytes than in characters.
 */
export function cleanDoc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (new TextEncoder().encode(value).byteLength > MAX_DOC_BYTES) return null;
  try {
    JSON.parse(value);
  } catch {
    return null;
  }
  return value;
}

async function count(env: Env, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// --- projects ---------------------------------------------------------------------------

export async function listProjects({ env, user }: Ctx): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.created_at, p.updated_at,
            (SELECT count(*) FROM boards b WHERE b.project_id = p.id) AS boards
       FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC`,
  )
    .bind(user.id)
    .all();
  return json({ projects: results });
}

export async function createProject(ctx: Ctx): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  if (!name) return fail("invalid_name", 400);

  const existing = await count(ctx.env, "SELECT count(*) n FROM projects WHERE user_id = ?", ctx.user.id);
  if (existing >= MAX_PROJECTS_PER_USER) return fail("project_limit_reached", 409);

  const id = newId();
  await ctx.env.DB.prepare(
    "INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, ctx.user.id, name, ctx.now, ctx.now)
    .run();

  return json({ project: { id, name, created_at: ctx.now, updated_at: ctx.now, boards: 0 } }, 201);
}

export async function renameProject(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  if (!name) return fail("invalid_name", 400);

  const result = await ctx.env.DB.prepare(
    "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  )
    .bind(name, ctx.now, id, ctx.user.id)
    .run();

  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ project: { id, name, updated_at: ctx.now } });
}

/**
 * The boards and their snapshot rows go with it, by cascade. The published BODIES do not —
 * they live in KV, which no foreign key reaches — so they are purged first, while the boards
 * can still be listed. After the cascade there is nothing left to ask.
 */
export async function deleteProject(ctx: Ctx, id: string): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    "SELECT id FROM boards WHERE project_id = ? AND user_id = ?",
  )
    .bind(id, ctx.user.id)
    .all<{ id: string }>();
  await purgeSnapshotsFor(ctx.env, results.map((row) => row.id));

  const result = await ctx.env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ ok: true });
}

// --- boards -----------------------------------------------------------------------------

/** Metadata only. The documents are the large part and nobody listing needs them. */
export async function listBoards({ env, user }: Ctx, projectId: string): Promise<Response> {
  const owns = await count(
    env,
    "SELECT count(*) n FROM projects WHERE id = ? AND user_id = ?",
    projectId,
    user.id,
  );
  if (owns === 0) return fail("not_found", 404);

  const { results } = await env.DB.prepare(
    `SELECT id, name, version, share_slug, created_at, updated_at
       FROM boards WHERE project_id = ? AND user_id = ?
      ORDER BY updated_at DESC`,
  )
    .bind(projectId, user.id)
    .all();
  return json({ boards: results });
}

export async function createBoard(ctx: Ctx, projectId: string): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  const doc = cleanDoc(payload?.doc);
  if (!name) return fail("invalid_name", 400);
  if (doc === null) return fail("invalid_document", 400);

  const owns = await count(
    ctx.env,
    "SELECT count(*) n FROM projects WHERE id = ? AND user_id = ?",
    projectId,
    ctx.user.id,
  );
  if (owns === 0) return fail("not_found", 404);

  const existing = await count(
    ctx.env,
    "SELECT count(*) n FROM boards WHERE user_id = ?",
    ctx.user.id,
  );
  if (existing >= MAX_BOARDS_PER_USER) return fail("board_limit_reached", 409);

  const id = newId();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO boards (id, project_id, user_id, name, doc, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, projectId, ctx.user.id, name, doc, ctx.now, ctx.now),
    // A project's timestamp orders the list, so it follows the boards inside it.
    ctx.env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(ctx.now, projectId),
  ]);

  return json({ board: { id, project_id: projectId, name, version: 1, updated_at: ctx.now } }, 201);
}

export async function getBoard({ env, user }: Ctx, id: string): Promise<Response> {
  const board = await env.DB.prepare(
    `SELECT id, project_id, name, doc, version, share_slug, created_at, updated_at
       FROM boards WHERE id = ? AND user_id = ?`,
  )
    .bind(id, user.id)
    .first();
  return board ? json({ board }) : fail("not_found", 404);
}

/**
 * Optimistic concurrency. The write carries the version it read and is refused if that no
 * longer matches, so two tabs on one board cannot lose an edit in silence.
 *
 * The version is part of the WHERE clause rather than checked beforehand: a read-then-write
 * has a gap between the two in which the other tab lands, and the gap is the bug. The extra
 * SELECT runs only when the update matched nothing, purely to tell a stale version (409) from
 * a board that is gone or never yours (404).
 */
export async function updateBoard(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const doc = cleanDoc(payload?.doc);
  const version = payload?.version;
  if (doc === null) return fail("invalid_document", 400);
  if (typeof version !== "number" || !Number.isInteger(version)) return fail("invalid_version", 400);

  // A rename is optional on a save; leaving it out keeps the current name.
  const name = payload?.name === undefined ? null : cleanName(payload.name);
  if (payload?.name !== undefined && name === null) return fail("invalid_name", 400);

  const result = await ctx.env.DB.prepare(
    `UPDATE boards
        SET doc = ?, name = COALESCE(?, name), version = version + 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND version = ?`,
  )
    .bind(doc, name, ctx.now, id, ctx.user.id, version)
    .run();

  if (result.meta.changes === 0) {
    const current = await ctx.env.DB.prepare(
      "SELECT version FROM boards WHERE id = ? AND user_id = ?",
    )
      .bind(id, ctx.user.id)
      .first<{ version: number }>();
    if (!current) return fail("not_found", 404);
    return json({ error: "version_conflict", version: current.version }, 409);
  }

  return json({ board: { id, version: version + 1, updated_at: ctx.now } });
}

/** Deleting a board withdraws every link published from it, and removes the bodies (0003). */
export async function deleteBoard(ctx: Ctx, id: string): Promise<Response> {
  const owned = await count(
    ctx.env,
    "SELECT count(*) n FROM boards WHERE id = ? AND user_id = ?",
    id,
    ctx.user.id,
  );
  if (owned === 0) return fail("not_found", 404);

  await purgeSnapshotsFor(ctx.env, [id]);
  await ctx.env.DB.prepare("DELETE FROM boards WHERE id = ? AND user_id = ?")
    .bind(id, ctx.user.id)
    .run();
  return json({ ok: true });
}
