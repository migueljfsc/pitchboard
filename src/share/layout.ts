/**
 * How wide the two sidebars are, as the reader left them.
 *
 * A per-browser convenience, through the ordinary storage layer: nothing throws,
 * and a stored width is validated rather than trusted (D31) — out of range or not
 * a number, and the default comes back.
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const LAYOUT_KEY = keyFor("layout");

export const SIDEBAR_MIN = 224;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 256;

export type Layout = { left: number; right: number };

const width = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : null;

export function loadLayout(store: Store | null = browserStore()): Layout {
  const stored = read(store, LAYOUT_KEY, (raw) => (raw && typeof raw === "object" ? raw : null)) as
    | Record<string, unknown>
    | null;
  return {
    left: width(stored?.left) ?? SIDEBAR_DEFAULT,
    right: width(stored?.right) ?? SIDEBAR_DEFAULT,
  };
}

export const saveLayout = (layout: Layout, store: Store | null = browserStore()): boolean =>
  write(store, LAYOUT_KEY, layout);

/** A width kept inside the range a sidebar may take. */
export const clampSidebar = (v: number): number =>
  Math.round(Math.min(Math.max(v, SIDEBAR_MIN), SIDEBAR_MAX));
