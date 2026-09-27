/**
 * The sport a new board starts in: whichever this browser last chose.
 *
 * A per-browser convenience, through the ordinary storage layer. A stored value that
 * names no sport is discarded, and football comes back (D31).
 */

import type { Sport } from "@/board/types";
import { DEFAULT_SPORT, SPORT_IDS } from "@/board/sports";
import { browserStore, keyFor, read, write, type Store } from "./storage";

export const SPORT_KEY = keyFor("sport");

export function loadSport(store: Store | null = browserStore()): Sport {
  return read(store, SPORT_KEY, (raw) => (SPORT_IDS.includes(raw as Sport) ? (raw as Sport) : null)) ?? DEFAULT_SPORT;
}

export const saveSport = (sport: Sport, store: Store | null = browserStore()): boolean =>
  write(store, SPORT_KEY, sport);
