/**
 * The operator's view: who has an account, and how much the site is used (D108).
 *
 * METADATA ONLY. Counts, dates and sizes — never a board's document, a preset's body or a
 * session. The one write is erasing an account (D110), for a deletion request that arrives by
 * email rather than through the account's own menu. Sizes and scene counts are computed inside D1 (`length`, `json_*`), so a
 * document never crosses into the Worker and the 10 ms CPU budget is spent on nothing but
 * serialising the answer.
 *
 * INVISIBLE TO EVERYONE ELSE. A stranger, a signed-in user and an unknown admin path all get
 * the same 404, so the surface cannot be discovered by probing it. Who counts as an admin is
 * `ADMIN_EMAILS`, compared against the session's email, which Google verified at sign-in.
 */

import { body, confirms, eraseAccount } from "./account";
import { fail, json } from "./http";
import type { SessionUser } from "./session";

/** Newest first; enough for a portfolio site, and a bound on the response either way. */
export const ADMIN_USER_LIMIT = 500;

const DAY_S = 24 * 60 * 60;

/** How far back the charts reach. Ninety days is a season's worth, and bounds the rows. */
export const SERIES_DAYS = 90;

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
  // Whole UTC days, today included: the last point is the total the tiles show.
  const since = now - (now % DAY_S) - (SERIES_DAYS - 1) * DAY_S;
  const [totals, users, signups, boardsCreated, before, methods] = await env.DB.batch([
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
    // Per UTC day, only the days that had any; the page fills the gaps with zero.
    env.DB.prepare(
      `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n
         FROM users WHERE created_at >= ?1 GROUP BY day ORDER BY day`,
    ).bind(since),
    env.DB.prepare(
      `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n
         FROM boards WHERE created_at >= ?1 GROUP BY day ORDER BY day`,
    ).bind(since),
    // Where the cumulative line starts: everyone who signed up before the window.
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at < ?1").bind(since),
    env.DB.prepare(
      `SELECT
         COALESCE(SUM(g AND NOT p), 0) AS google,
         COALESCE(SUM(p AND NOT g), 0) AS password,
         COALESCE(SUM(g AND p), 0) AS both
       FROM (SELECT password_hash IS NOT NULL AS p,
                    EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id) AS g
               FROM users u)`,
    ),
  ]);

  return json({
    totals: totals.results[0],
    users: users.results,
    series: {
      since,
      days: SERIES_DAYS,
      signups: signups.results,
      boards: boardsCreated.results,
      usersBefore: (before.results[0] as { n: number }).n,
    },
    methods: methods.results[0],
  });
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

/**
 * Erasing someone else's account (D110). The request repeats that account's address, as the
 * owner's own delete does, so a stale page or a mistyped id cannot take the wrong one. Logged by
 * id only — the log outlives the account, and the address was the personal data.
 */
export async function adminDeleteUser({ env }: AdminCtx, request: Request, userId: string): Promise<Response> {
  const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first<{ email: string }>();
  if (!user) return fail("not_found", 404);
  if (!confirms(await body(request), user.email)) return fail("confirmation_mismatch", 400);
  await eraseAccount(env, userId, user.email);
  console.log("admin erased account", userId);
  return json({ ok: true });
}
