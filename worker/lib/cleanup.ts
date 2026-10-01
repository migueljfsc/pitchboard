/**
 * The daily sweep: rows that can no longer do anything, deleted on a schedule rather than left
 * for a request that may never come.
 *
 * A session is deleted when it is presented after expiring, and an email token when its
 * address asks for another — so one nobody presents again stays forever. This clears them, and
 * trims the usage counters (D119) to what the admin page could ever show plus a year to spare.
 */

/** How long a day's usage counters are kept: a year and a season's worth of charts. */
export const USAGE_KEEP_DAYS = 400;

const DAY_S = 24 * 60 * 60;

export async function sweep(env: Env, now: number): Promise<void> {
  const oldestKept = new Date((now - USAGE_KEEP_DAYS * DAY_S) * 1000).toISOString().slice(0, 10);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM email_tokens WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM usage_daily WHERE day < ?1").bind(oldestKept),
  ]);
}
