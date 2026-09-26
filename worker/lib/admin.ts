/**
 * The operator's view: who has an account, and how much the site is used (D108).
 *
 * READ-ONLY, AND METADATA ONLY. Counts, dates and sizes — never a board's document, a preset's
 * body or a session. Sizes and scene counts are computed inside D1 (`length`, `json_*`), so a
 * document never crosses into the Worker and the 10 ms CPU budget is spent on nothing but
 * serialising the answer.
 *
 * INVISIBLE TO EVERYONE ELSE. A stranger, a signed-in user and an unknown admin path all get
 * the same 404, so the surface cannot be discovered by probing it. Who counts as an admin is
 * `ADMIN_EMAILS`, compared against the session's email, which Google verified at sign-in.
 */

import { fail, json } from "./http";
import type { SessionUser } from "./session";

/** Newest first; enough for a portfolio site, and a bound on the response either way. */
export const ADMIN_USER_LIMIT = 500;

const DAY_S = 24 * 60 * 60;

/** Pure, so the gate is testable without a Worker. */
export function adminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isAdmin(user: SessionUser | null, raw: string | undefined): boolean {
  return user !== null && adminEmails(raw).has(user.email.toLowerCase());
}

interface AdminCtx {
  env: Env;
  now: number;
}

/** A user's footprint — shared by the list and the drill-down so the two cannot disagree. */
const USER_COLUMNS = `
  u.id, u.email, u.display_name, u.created_at, u.last_login_at, u.last_seen_at,
  (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
  (SELECT COUNT(*) FROM boards b WHERE b.user_id = u.id) AS boards,
  (SELECT COUNT(*) FROM boards b WHERE b.user_id = u.id AND b.share_slug IS NOT NULL) AS published,
  (SELECT COUNT(*) FROM presets r WHERE r.user_id = u.id) AS presets,
  (SELECT COALESCE(SUM(length(CAST(b.doc AS BLOB))), 0) FROM boards b WHERE b.user_id = u.id) AS bytes,
  (SELECT MAX(b.updated_at) FROM boards b WHERE b.user_id = u.id) AS last_board_at`;

export async function adminStats({ env, now }: AdminCtx): Promise<Response> {
  const [totals, users] = await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM users WHERE created_at >= ?2) AS signups_7d,
         (SELECT COUNT(*) FROM users WHERE created_at >= ?3) AS signups_30d,
         (SELECT COUNT(*) FROM users WHERE last_seen_at >= ?1) AS active_1d,
         (SELECT COUNT(*) FROM users WHERE last_seen_at >= ?2) AS active_7d,
         (SELECT COUNT(*) FROM users WHERE last_seen_at >= ?3) AS active_30d,
         (SELECT COUNT(*) FROM projects) AS projects,
         (SELECT COUNT(*) FROM boards) AS boards,
         (SELECT COUNT(*) FROM boards WHERE created_at >= ?2) AS boards_created_7d,
         (SELECT COUNT(*) FROM boards WHERE updated_at >= ?2) AS boards_updated_7d,
         (SELECT COUNT(*) FROM boards WHERE share_slug IS NOT NULL) AS published,
         (SELECT COUNT(*) FROM presets) AS presets,
         (SELECT COUNT(*) FROM sessions WHERE expires_at > ?4) AS sessions,
         (SELECT COALESCE(SUM(length(CAST(doc AS BLOB))), 0) FROM boards) AS bytes`,
    ).bind(now - DAY_S, now - 7 * DAY_S, now - 30 * DAY_S, now),
    env.DB.prepare(
      `SELECT ${USER_COLUMNS} FROM users u ORDER BY u.created_at DESC LIMIT ?1`,
    ).bind(ADMIN_USER_LIMIT),
  ]);

  return json({ totals: totals.results[0], users: users.results });
}

export async function adminUser({ env }: AdminCtx, userId: string): Promise<Response> {
  const [user, projects, boards, presets] = await env.DB.batch([
    env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?1`).bind(userId),
    env.DB.prepare(
      `SELECT id, name, parent_id, created_at, updated_at
         FROM projects WHERE user_id = ?1 ORDER BY name`,
    ).bind(userId),
    // json_valid first: json_array_length on a malformed document is an error, and one bad
    // row would fail the whole page.
    env.DB.prepare(
      `SELECT id, name, project_id, share_slug, version, created_at, updated_at,
              length(CAST(doc AS BLOB)) AS bytes,
              CASE WHEN json_valid(doc) THEN json_array_length(doc, '$.scenes') END AS scenes
         FROM boards WHERE user_id = ?1 ORDER BY updated_at DESC`,
    ).bind(userId),
    env.DB.prepare(
      `SELECT id, label, created_at, updated_at
         FROM presets WHERE user_id = ?1 ORDER BY label`,
    ).bind(userId),
  ]);

  if (user.results.length === 0) return fail("not_found", 404);

  return json({
    user: user.results[0],
    projects: projects.results,
    boards: boards.results,
    presets: presets.results,
  });
}
