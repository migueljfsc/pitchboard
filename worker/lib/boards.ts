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
  MAX_BULK_IDS,
  MAX_DOC_BYTES,
  MAX_NAME_CHARS,
  MAX_PROJECTS_PER_USER,
  MAX_PROJECT_DEPTH,
} from "./limits";
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

/**
 * The id list of a bulk operation.
 *
 * ALL OR NOTHING on shape: one malformed id refuses the whole request rather than being
 * dropped quietly, because a selection that half-moves is worse than one that does not move.
 * Ownership is not checked here — it stays in the WHERE clause of every statement, so an id
 * belonging to somebody else matches nothing instead of being filtered in advance.
 */
function cleanIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0 || value.length > MAX_BULK_IDS) return null;
  const ok = value.every((v) => typeof v === "string" && /^[A-Za-z0-9_-]{22}$/.test(v));
  return ok ? [...new Set(value as string[])] : null;
}

async function count(env: Env, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// --- projects ---------------------------------------------------------------------------
//
// Projects nest (D51). Three things guard the shape, and all three live here because the
// database cannot enforce any of them: SQLite will happily let a folder become its own
// grandparent, and the result is a subtree nothing can reach and every walk loops through.
//
// The walks are bounded explicitly rather than trusted to terminate. A recursive CTE over
// data that already contains a cycle does not stop, and "this can never happen because the
// guard prevents it" is exactly the reasoning that makes the first corrupt row fatal.

/** Nothing legitimate climbs further than one row per project the account can hold. */
const WALK_LIMIT = MAX_PROJECTS_PER_USER;

/** How many ancestors a project has. A folder at the root is 0. */
async function depthOf(env: Env, userId: string, id: string): Promise<number> {
  const row = await env.DB.prepare(
    `WITH RECURSIVE up(id, parent_id, n) AS (
       SELECT id, parent_id, 0 FROM projects WHERE id = ?1 AND user_id = ?2
       UNION ALL
       SELECT p.id, p.parent_id, up.n + 1
         FROM projects p JOIN up ON p.id = up.parent_id
        WHERE p.user_id = ?2 AND up.n < ?3
     )
     SELECT max(n) AS n FROM up`,
  )
    .bind(id, userId, WALK_LIMIT)
    .first<{ n: number | null }>();
  return row?.n ?? 0;
}

/** How far the deepest descendant sits below a project. A folder with no children is 0. */
async function heightOf(env: Env, userId: string, id: string): Promise<number> {
  const row = await env.DB.prepare(
    `WITH RECURSIVE down(id, n) AS (
       SELECT id, 0 FROM projects WHERE id = ?1 AND user_id = ?2
       UNION ALL
       SELECT p.id, down.n + 1
         FROM projects p JOIN down ON p.parent_id = down.id
        WHERE p.user_id = ?2 AND down.n < ?3
     )
     SELECT max(n) AS n FROM down`,
  )
    .bind(id, userId, WALK_LIMIT)
    .first<{ n: number | null }>();
  return row?.n ?? 0;
}

/**
 * Whether `candidate` is `id` itself or sits somewhere beneath it.
 *
 * The cycle guard, asked of a proposed parent. Climbing from the candidate is the cheap
 * direction: a chain to the root is at most the depth cap, where walking down could be the
 * whole tree.
 */
async function withinSubtree(
  env: Env,
  userId: string,
  id: string,
  candidate: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `WITH RECURSIVE up(id, parent_id, n) AS (
       SELECT id, parent_id, 0 FROM projects WHERE id = ?1 AND user_id = ?2
       UNION ALL
       SELECT p.id, p.parent_id, up.n + 1
         FROM projects p JOIN up ON p.id = up.parent_id
        WHERE p.user_id = ?2 AND up.n < ?3
     )
     SELECT count(*) AS n FROM up WHERE id = ?4`,
  )
    .bind(candidate, userId, WALK_LIMIT, id)
    .first<{ n: number }>();
  return (row?.n ?? 0) > 0;
}

export async function listProjects({ env, user }: Ctx): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.parent_id, p.created_at, p.updated_at,
            (SELECT count(*) FROM boards b WHERE b.project_id = p.id) AS boards
       FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC`,
  )
    .bind(user.id)
    .all();
  return json({ projects: results });
}

/**
 * The parent named by a request, checked.
 *
 * Returns the id, or `null` for the root, or an error code. Ownership is checked here rather
 * than left to a WHERE clause because a parent is not the row being written: filing a folder
 * under a stranger's would silently succeed and then show up in their rail.
 */
async function parentFrom(
  ctx: Ctx,
  value: unknown,
): Promise<{ id: string | null } | { error: string }> {
  if (value === null || value === undefined) return { id: null };
  if (typeof value !== "string") return { error: "invalid_project" };

  const owns = await count(
    ctx.env,
    "SELECT count(*) n FROM projects WHERE id = ? AND user_id = ?",
    value,
    ctx.user.id,
  );
  if (owns === 0) return { error: "not_found" };
  return { id: value };
}

export async function createProject(ctx: Ctx): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  if (!name) return fail("invalid_name", 400);

  const parent = await parentFrom(ctx, payload?.parent_id);
  if ("error" in parent) return fail(parent.error, parent.error === "not_found" ? 404 : 400);

  if (parent.id !== null) {
    const depth = await depthOf(ctx.env, ctx.user.id, parent.id);
    if (depth + 1 > MAX_PROJECT_DEPTH) return fail("project_too_deep", 409);
  }

  const existing = await count(ctx.env, "SELECT count(*) n FROM projects WHERE user_id = ?", ctx.user.id);
  if (existing >= MAX_PROJECTS_PER_USER) return fail("project_limit_reached", 409);

  const id = newId();
  await ctx.env.DB.prepare(
    "INSERT INTO projects (id, user_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, ctx.user.id, name, parent.id, ctx.now, ctx.now)
    .run();

  return json(
    {
      project: {
        id,
        name,
        parent_id: parent.id,
        created_at: ctx.now,
        updated_at: ctx.now,
        boards: 0,
      },
    },
    201,
  );
}

/**
 * Rename a project, re-file it, or both.
 *
 * One route for two edits because the client holds the whole project and both are a PATCH of
 * one row. `parent_id` is read by PRESENCE, not by truthiness: absent means leave it where it
 * is, and an explicit null means move it to the root — two different requests that a plain
 * falsiness check would collapse into one.
 */
export async function updateProject(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const renaming = payload?.name !== undefined;
  const refiling = payload !== null && "parent_id" in payload;

  const name = renaming ? cleanName(payload.name) : null;
  if (renaming && !name) return fail("invalid_name", 400);
  if (!renaming && !refiling) return fail("invalid_name", 400);

  let parentId: string | null = null;
  if (refiling) {
    const parent = await parentFrom(ctx, payload.parent_id);
    if ("error" in parent) return fail(parent.error, parent.error === "not_found" ? 404 : 400);
    parentId = parent.id;

    if (parentId === id) return fail("project_cycle", 409);
    if (parentId !== null) {
      // A folder cannot be filed under its own descendant: the subtree would be unreachable
      // from every root, so it would vanish from the rail rather than move.
      if (await withinSubtree(ctx.env, ctx.user.id, id, parentId)) {
        return fail("project_cycle", 409);
      }
      // Measured with the subtree it is carrying, not just its own new depth.
      const depth = await depthOf(ctx.env, ctx.user.id, parentId);
      const height = await heightOf(ctx.env, ctx.user.id, id);
      if (depth + 1 + height > MAX_PROJECT_DEPTH) return fail("project_too_deep", 409);
    }
  }

  // Every placeholder is NUMBERED. Mixing a bare `?` into a statement that also uses `?N`
  // is legal SQLite and assigns the bare one "largest index so far, plus one" — which is not
  // the position it appears in, and silently binds the wrong value.
  const result = await ctx.env.DB.prepare(
    `UPDATE projects
        SET name = COALESCE(?1, name),
            parent_id = CASE WHEN ?2 THEN ?3 ELSE parent_id END,
            updated_at = ?4
      WHERE id = ?5 AND user_id = ?6`,
  )
    .bind(name, refiling ? 1 : 0, parentId, ctx.now, id, ctx.user.id)
    .run();

  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ project: { id, ...(name ? { name } : {}), ...(refiling ? { parent_id: parentId } : {}), updated_at: ctx.now } });
}

/**
 * Delete a project, everything filed under it, and every board in any of them.
 *
 * Still one statement. `projects.parent_id` cascades into the subfolders and each of those
 * cascades into its boards, so the whole thing goes at once — which is why the confirmation
 * on the other side has to count the subtree rather than just the folder.
 */
export async function deleteProject(ctx: Ctx, id: string): Promise<Response> {
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

/**
 * Every board the user has, metadata only.
 *
 * What a library view needs: it shows "all boards", searches across projects, and derives each
 * project's contents from this one list rather than fetching per project — which is a request
 * per expanded folder, and a cache to keep in step with the moves the same view is making.
 * The cap is 200 boards per account, so this is small by construction.
 */
export async function listAllBoards({ env, user }: Ctx): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_id, name, version, share_slug, created_at, updated_at
       FROM boards WHERE user_id = ?
      ORDER BY updated_at DESC`,
  )
    .bind(user.id)
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

/**
 * Move a board to another project.
 *
 * BOTH halves of the ownership question are in the WHERE clause — the board is yours, and so
 * is the project it is going into. Checking the destination separately would be the same query
 * written so that forgetting the check files a board under a stranger's project, where they
 * would then see it listed. "Not yours" and "not there" answer the same 404 as everywhere else.
 *
 * The version is deliberately not bumped: a move does not touch the document, and bumping it
 * would 409 the open editor's next autosave over a change it did not make.
 */
export async function moveBoard(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const projectId = typeof payload?.project_id === "string" ? payload.project_id : null;
  if (!projectId) return fail("invalid_project", 400);

  const result = await ctx.env.DB.prepare(
    `UPDATE boards SET project_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
        AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND user_id = ?)`,
  )
    .bind(projectId, ctx.now, id, ctx.user.id, projectId, ctx.user.id)
    .run();

  if (result.meta.changes === 0) return fail("not_found", 404);

  // Only the destination is touched. The project's timestamp orders the list and something
  // did just land there; the one it left is unchanged in every way a reader can see, since
  // the board count in `listProjects` is counted live rather than stored.
  await ctx.env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(ctx.now, projectId, ctx.user.id)
    .run();

  return json({ board: { id, project_id: projectId, updated_at: ctx.now } });
}

/**
 * Duplicate a board into the project it already lives in.
 *
 * INSERT ... SELECT, so the document never travels. Pulling a quarter-megabyte board down to
 * the browser and posting it straight back would spend two requests and the CPU budget moving
 * bytes the database is already holding.
 *
 * THE COPY IS NOT PUBLISHED. `share_slug` is unique per board, so carrying it over would either
 * trip the index or re-aim a link the author has already given out at a board they did not send.
 * A copy starts private and can be published on its own terms.
 *
 * The name arrives from the client because the Worker has no locale (D38) — "(copy)" is a word,
 * and words are the browser's job.
 */
export async function copyBoard(ctx: Ctx, id: string): Promise<Response> {
  const payload = await body(ctx.request);
  const name = cleanName(payload?.name);
  if (!name) return fail("invalid_name", 400);

  const existing = await count(
    ctx.env,
    "SELECT count(*) n FROM boards WHERE user_id = ?",
    ctx.user.id,
  );
  if (existing >= MAX_BOARDS_PER_USER) return fail("board_limit_reached", 409);

  const copy = newId();
  const result = await ctx.env.DB.prepare(
    `INSERT INTO boards (id, project_id, user_id, name, doc, version, created_at, updated_at)
     SELECT ?, project_id, user_id, ?, doc, 1, ?, ?
       FROM boards WHERE id = ? AND user_id = ?`,
  )
    .bind(copy, name, ctx.now, ctx.now, id, ctx.user.id)
    .run();

  if (result.meta.changes === 0) return fail("not_found", 404);

  // Found through the copy, which is the only id this side knows and is already filtered by
  // owner — the project it landed in is one board heavier and belongs at the top of the list.
  await ctx.env.DB.prepare(
    `UPDATE projects SET updated_at = ?
      WHERE id = (SELECT project_id FROM boards WHERE id = ? AND user_id = ?) AND user_id = ?`,
  )
    .bind(ctx.now, copy, ctx.user.id, ctx.user.id)
    .run();

  return json({ board: { id: copy, name, version: 1, updated_at: ctx.now } }, 201);
}

/**
 * Move a selection of boards into one project.
 *
 * One `batch`, which D1 runs as a single transaction — so a selection cannot end up half in
 * one project and half in another because the network gave up in the middle. Every statement
 * carries the same two-sided ownership guard as the single move, so an id that is not yours
 * matches nothing rather than being trusted because it arrived in a list.
 */
export async function moveBoards(ctx: Ctx): Promise<Response> {
  const payload = await body(ctx.request);
  const ids = cleanIds(payload?.ids);
  const projectId = typeof payload?.project_id === "string" ? payload.project_id : null;
  if (!ids) return fail("invalid_selection", 400);
  if (!projectId) return fail("invalid_project", 400);

  const results = await ctx.env.DB.batch(
    ids.map((id) =>
      ctx.env.DB.prepare(
        `UPDATE boards SET project_id = ?, updated_at = ?
          WHERE id = ? AND user_id = ?
            AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND user_id = ?)`,
      ).bind(projectId, ctx.now, id, ctx.user.id, projectId, ctx.user.id),
    ),
  );

  const moved = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  if (moved === 0) return fail("not_found", 404);

  await ctx.env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(ctx.now, projectId, ctx.user.id)
    .run();

  return json({ moved });
}

/**
 * Delete a selection of boards, and the share links they were published under.
 *
 * The ids arrive in the body rather than the query string: a hundred of them is 2,300
 * characters of URL, and a proxy truncating that would delete a prefix of what was asked for.
 * A body is the only place a list of this size is safe.
 */
export async function deleteBoards(ctx: Ctx): Promise<Response> {
  const payload = await body(ctx.request);
  const ids = cleanIds(payload?.ids);
  if (!ids) return fail("invalid_selection", 400);

  const results = await ctx.env.DB.batch(
    ids.map((id) =>
      ctx.env.DB.prepare("DELETE FROM boards WHERE id = ? AND user_id = ?").bind(id, ctx.user.id),
    ),
  );

  const deleted = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  if (deleted === 0) return fail("not_found", 404);
  return json({ deleted });
}

/** Deleting a board takes its share link with it: the slug lives on this row. */
export async function deleteBoard(ctx: Ctx, id: string): Promise<Response> {
  const result = await ctx.env.DB.prepare("DELETE FROM boards WHERE id = ? AND user_id = ?")
    .bind(id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ ok: true });
}
