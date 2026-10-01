/**
 * Where the board's view bar sits, and whether it is folded, as the reader left them.
 *
 * Per browser, through the ordinary storage layer, validated rather than trusted (D31). The
 * place is kept as a share of the free space across and down the board — 0 the left or top
 * edge, 1 the right or bottom — so it stays in the same corner when the window changes size.
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const VIEW_BAR_KEY = keyFor("view-dock");

export type ViewBarPlace = { x: number; y: number; collapsed: boolean };

/**
 * Against the board's left edge, halfway down — in the dead space beside a pitch, which is
 * nearly always wider than it is tall. Where the bar starts, and where reset puts it.
 */
export const VIEW_BAR_HOME: ViewBarPlace = { x: 0, y: 0.5, collapsed: false };

const share = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;

export function loadViewBar(store: Store | null = browserStore()): ViewBarPlace {
  const stored = read(store, VIEW_BAR_KEY, (raw) => (raw && typeof raw === "object" ? raw : null)) as
    | Record<string, unknown>
    | null;
  return {
    x: share(stored?.x) ?? VIEW_BAR_HOME.x,
    y: share(stored?.y) ?? VIEW_BAR_HOME.y,
    collapsed: stored?.collapsed === true,
  };
}

export const saveViewBar = (place: ViewBarPlace, store: Store | null = browserStore()): boolean =>
  write(store, VIEW_BAR_KEY, place);
