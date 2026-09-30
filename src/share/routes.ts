/**
 * What a path can mean.
 *
 * Five, and they are the only reason this app knows about paths at all — it is still not a
 * router (D33's "no router" holds; a path is one more thing the address can be, read once,
 * because changing one is a page load rather than an event).
 *
 *   /              the landing page, for a visitor who is not signed in.
 *   /app           the editor, on the board in progress.
 *   /board/<id>    a saved board, opened for editing. Needs an account.
 *   /share/<slug>  a published board, opened read-only. Needs nothing.
 *   /admin         the operator's usage view (D108). The Worker decides who sees data.

 *
 * All resolve because the Worker serves index.html for unknown paths.
 */

const BOARD_PATH = /^\/board\/([A-Za-z0-9_-]{22})$/;
const SHARE_PATH = /^\/share\/([2-9bcdfghjkmnpqrstvwxz]{8})$/;

export const APP_PATH = "/app";

export const isLandingPath = (pathname = window.location.pathname): boolean => pathname === "/";

/**
 * Query parameters that mean the editor has something to do: a sign-in just finished, a link
 * from an email, a fresh board. The Worker and older emails send them to `/`, so the landing
 * page steps aside for them rather than dropping them.
 */
const APP_PARAMS = ["fresh", "welcome", "verify", "reset", "auth_error"];

export const wantsApp = (search = window.location.search): boolean => {
  const params = new URLSearchParams(search);
  return APP_PARAMS.some((name) => params.has(name));
};

/**
 * The landing page asked for by name — the logo, from anywhere in the app. A signed-in visitor
 * who arrives at `/` goes straight to the editor; one who clicks the logo meant to leave it.
 */
export const HOME_PATH = "/?home";

export const wantsHome = (search = window.location.search): boolean =>
  new URLSearchParams(search).has("home");

/** Set on the history entry once `?home` is tidied away, so a reload stays on the landing page. */
export const HOME_STATE = { home: true } as const;

export const cameHome = (): boolean =>
  (window.history.state as { home?: boolean } | null)?.home === true;

export const isAdminPath = (pathname = window.location.pathname): boolean =>
  pathname === "/admin" || pathname === "/admin/";

export const boardPath = (id: string): string => `/board/${id}`;
export const sharePath = (slug: string): string => `/share/${slug}`;

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
