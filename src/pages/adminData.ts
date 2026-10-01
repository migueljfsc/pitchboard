/**
 * The numbers behind the operator's charts (D108), and their colours — split from
 * `AdminCharts.tsx` so that file exports components only.
 *
 * Colours follow one rule each. A single series wears the app's amber; the sign-in split takes
 * three categorical slots in fixed order; "last seen" is an ordered one-hue ramp, brightest for
 * the most recent, with "never" in neutral grey. All were validated against the page surface
 * (`ink-800`) for contrast and colour-blind separation.
 */

export const DAY_S = 24 * 60 * 60;

export const AMBER = "#fbbf24";
export const CATEGORICAL = ["#3987e5", "#d95926", "#199e70"] as const;
/** Most recent first: brightest on a dark surface reads as "most". */
export const RECENCY = ["#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"] as const;
export const NEUTRAL = "#35473f";

/** One value per UTC day from `since`, zero where the server had no row. */
export function fillDays(rows: Array<{ day: string; n: number }>, since: number, days: number): number[] {
  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => byDay.get(isoDay(since + i * DAY_S)) ?? 0);
}

/** The last `weeks` whole 7-day runs, ending today — so the newest column is this week. */
export function lastWeeks(daily: number[], weeks: number): number[] {
  const out: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = daily.length - w * 7;
    out.push(daily.slice(Math.max(0, end - 7), end).reduce((a, b) => a + b, 0));
  }
  return out;
}

export function cumulative(start: number, daily: number[]): number[] {
  let total = start;
  return daily.map((n) => (total += n));
}

export function isoDay(at: number): string {
  return new Date(at * 1000).toISOString().slice(0, 10);
}

export function shortDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** One or more anonymous counters (D119), summed per day and filled like `fillDays`. */
export function usageDays(
  usage: Array<{ day: string; event: string; n: number }>,
  events: readonly string[],
  since: number,
  days: number,
): number[] {
  const wanted = new Set(events);
  const byDay = new Map<string, number>();
  for (const row of usage) {
    if (wanted.has(row.event)) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.n);
  }
  return fillDays([...byDay].map(([day, n]) => ({ day, n })), since, days);
}

/** The sum of the last `n` days of a daily series. */
export const lastDays = (daily: number[], n: number): number =>
  daily.slice(-n).reduce((a, b) => a + b, 0);
