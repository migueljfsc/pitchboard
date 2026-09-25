/**
 * Whether this browser has been through the editor's tour.
 *
 * Stored as the version of the tour last seen rather than a flag, so a tour that
 * grows can show itself once more to everybody who saw the smaller one. Through
 * the ordinary storage layer, so nothing throws and what comes back is validated
 * rather than trusted (D31): anything but a whole number reads as never seen,
 * which is the harmless way to be wrong.
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const TOUR_KEY = keyFor("tour-seen");

/** Bump when the tour gains something everybody who has seen it should see. */
export const TOUR_VERSION = 1;

export const tourSeen = (store: Store | null = browserStore()): boolean =>
  (read(store, TOUR_KEY, (raw) => (Number.isInteger(raw) ? (raw as number) : null)) ?? 0) >=
  TOUR_VERSION;

export const markTourSeen = (store: Store | null = browserStore()): boolean =>
  write(store, TOUR_KEY, TOUR_VERSION);
