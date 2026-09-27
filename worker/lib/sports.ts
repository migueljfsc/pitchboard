/**
 * The sports a board can be, as the Worker knows them (D114).
 *
 * Mirrors `SPORT_IDS` in `src/board/types.ts`; `sports.test.ts` there fails if the two drift.
 * The Worker imports nothing from the app, so it keeps its own copy of the one list it needs:
 * the roots every account's library is filed under.
 */

export const SPORTS = ["football", "futsal", "basketball", "handball", "hockey", "volleyball"] as const;

export type Sport = (typeof SPORTS)[number];

/**
 * The sport a stored document is for: its `sport`, or football where it names none — every
 * board saved before there was a choice. Anything else it could say is not a sport, and is
 * refused rather than filed somewhere.
 */
export function sportOfDoc(doc: string): Sport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(doc);
  } catch {
    return null;
  }
  const sport = (parsed as { sport?: unknown } | null)?.sport;
  if (sport === undefined) return "football";
  return SPORTS.includes(sport as Sport) ? (sport as Sport) : null;
}

/**
 * The same, in SQL, for a `boards.doc` column — so a move can compare a board's sport with
 * its destination's without the document ever leaving the database.
 */
export const DOC_SPORT_SQL = "COALESCE(json_extract(doc, '$.sport'), 'football')";
