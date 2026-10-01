/**
 * Anonymous usage counters (D119): one number per UTC day and event, for the operator's view.
 *
 * Anyone may bump one, signed in or not — most of the site's use has no account behind it —
 * which makes this the Worker's one unauthenticated write. Three things keep it from being a
 * way to spend the free tier's writes: events come from a fixed list, a rate limit keyed by
 * the caller's address (read for the limit, never stored) turns a loop away, and every row
 * stops at `USAGE_DAILY_CAP`, past which a bump writes nothing at all.
 */

import { body } from "./account";
import { fail, json } from "./http";

/** Every event there is. Adding one is adding it here and calling `countUsage` with it. */
export const USAGE_EVENTS = [
  "page.landing",
  "page.editor",
  "page.viewer",
  "export.mp4",
  "export.webm",
  "export.gif",
  "export.png",
  "share.snapshot",
  "share.live",
  "import.board",
  "import.setup",
  "import.tracks",
  "present",
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

/** Far past a real day's traffic for a portfolio site; a bound on what a loop can inflate. */
export const USAGE_DAILY_CAP = 10_000;

const KNOWN = new Set<string>(USAGE_EVENTS);

/** Pure, so the gate is testable without a Worker. */
export function usageEvent(raw: unknown): UsageEvent | null {
  return typeof raw === "string" && KNOWN.has(raw) ? (raw as UsageEvent) : null;
}

export const usageDay = (now: number): string => new Date(now * 1000).toISOString().slice(0, 10);

export async function countUsage(env: Env, request: Request, now: number): Promise<Response> {
  const event = usageEvent((await body(request)).event);
  if (!event) return fail("unknown_event", 400);

  const address = request.headers.get("cf-connecting-ip");
  if (address) {
    const { success } = await env.USAGE_LIMIT.limit({ key: address });
    if (!success) return fail("rate_limited", 429);
  }

  await env.DB.prepare(
    `INSERT INTO usage_daily (day, event, n) VALUES (?1, ?2, 1)
       ON CONFLICT (day, event) DO UPDATE SET n = n + 1 WHERE n < ?3`,
  )
    .bind(usageDay(now), event, USAGE_DAILY_CAP)
    .run();
  return json({ ok: true });
}
