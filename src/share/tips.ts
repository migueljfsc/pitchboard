/**
 * Whether the board's first-run tip has been dismissed.
 *
 * Through the ordinary storage layer, so it inherits both of its rules: nothing
 * throws, and what comes back is validated rather than trusted (D31). Anything but
 * a stored `true` shows the tip again, which is the harmless way to be wrong.
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const TIP_KEY = keyFor("tip-dismissed");

export const tipDismissed = (store: Store | null = browserStore()): boolean =>
  read(store, TIP_KEY, (raw) => (raw === true ? true : null)) === true;

export const dismissTip = (store: Store | null = browserStore()): boolean =>
  write(store, TIP_KEY, true);
