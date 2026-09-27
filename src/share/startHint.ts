/**
 * Whether this browser has put away the card that says where to start on a fresh board.
 * Through the ordinary storage layer, so nothing throws, and anything but `true` reads
 * as not put away — the harmless way to be wrong (D31).
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const START_HINT_KEY = keyFor("start-hint-dismissed");

export const startHintDismissed = (store: Store | null = browserStore()): boolean =>
  read(store, START_HINT_KEY, (raw) => (raw === true ? true : null)) === true;

export const dismissStartHint = (store: Store | null = browserStore()): boolean =>
  write(store, START_HINT_KEY, true);
