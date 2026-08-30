/**
 * What a path can mean.
 *
 * Two, and they are the only reason this app knows about paths at all — it is still not a
 * router (D33's "no router" holds; a path is one more thing the address can be, read once,
 * because changing one is a page load rather than an event).
 *
 *   /board/<id>   a saved board, opened for editing. Needs an account.
 *   /s/<slug>     a published board, opened read-only. Needs nothing.
 *
 * Both resolve only on the Worker, which serves index.html for unknown paths. The GitHub
 * Pages deploy has neither the rewrite nor the server, which is correct — it has no accounts
 * either.
 */

const BOARD_PATH = /^\/board\/([A-Za-z0-9_-]{22})$/;
const SHARE_PATH = /\/s\/([2-9bcdfghjkmnpqrstvwxz]{8})$/;

export const boardPath = (id: string): string => `/board/${id}`;

export const readBoardId = (pathname = window.location.pathname): string | null =>
  BOARD_PATH.exec(pathname)?.[1] ?? null;

export const readShareSlug = (pathname = window.location.pathname): string | null =>
  SHARE_PATH.exec(pathname)?.[1] ?? null;

/**
 * Put a board's address in the bar without reloading.
 *
 * `pushState`, so the back button walks between boards the way it walks between pages —
 * which is what makes the address a real address rather than a label.
 */
export function goToBoard(id: string): void {
  if (readBoardId() === id) return;
  window.history.pushState(null, "", boardPath(id));
}
