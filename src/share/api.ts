/**
 * The API client — the only place in the app that talks to the Worker.
 *
 * SAME ORIGIN, ALWAYS. Every path is relative, so the session cookie rides along without
 * `credentials` ceremony and there is no origin to configure. On the GitHub Pages deploy
 * these calls simply fail, which is correct: that host has no server behind it (D39 keeps it
 * running for existing links, not for accounts).
 *
 * ERRORS ARE CODES, NOT SENTENCES. The Worker has no locale, so it answers with
 * `{ error: "board_limit_reached" }` and the caller turns that into words through i18n — the
 * same reason the pure engine modules return a `Message` (D38). `ApiError.code` is the key.
 */

/** A board's row, without the document — what a list needs and no more. */
export interface BoardSummary {
  id: string;
  name: string;
  version: number;
  share_slug: string | null;
  created_at: number;
  updated_at: number;
}

export interface StoredBoard extends BoardSummary {
  project_id: string;
  /** The serialised `BoardDoc`. Validated on arrival by the caller, never by the server. */
  doc: string;
}

export interface Project {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  boards: number;
}

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** Present on a 409 from a board save: the version the server actually holds. */
    readonly version?: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
  } catch {
    // A dead network and a dead Worker are the same thing to a caller that has to decide
    // whether to keep the local copy — which it always does.
    throw new ApiError("offline", 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  const body = (payload ?? {}) as Record<string, unknown>;

  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : "request_failed";
    const version = typeof body.version === "number" ? body.version : undefined;
    throw new ApiError(code, response.status, version);
  }

  return body as T;
}

// --- account ----------------------------------------------------------------------------

/**
 * The signed-in user, or null. A 401 is an answer rather than a failure — being signed out is
 * the normal state, since accounts are optional and the whole app works without one.
 */
export async function fetchAccount(): Promise<Account | null> {
  try {
    const { user } = await call<{ user: Account }>("/me");
    return user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 0)) return null;
    throw error;
  }
}

/**
 * A full navigation, not a fetch: the flow ends in a redirect from Google.
 *
 * The current path goes with it, so signing in to open a deep link to a saved board comes
 * back to that board rather than to a blank one. The Worker validates it — a path it wrote is
 * still the browser's copy of it by the time it returns.
 */
export function startGoogleSignIn(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
}

export async function signOut(): Promise<void> {
  await call("/auth/logout", { method: "POST" });
}

// --- projects ---------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const { projects } = await call<{ projects: Project[] }>("/projects");
  return projects;
}

export async function createProject(name: string): Promise<Project> {
  const { project } = await call<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
  await call(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export async function deleteProject(id: string): Promise<void> {
  await call(`/projects/${id}`, { method: "DELETE" });
}

// --- boards -----------------------------------------------------------------------------

export async function listBoards(projectId: string): Promise<BoardSummary[]> {
  const { boards } = await call<{ boards: BoardSummary[] }>(`/projects/${projectId}/boards`);
  return boards;
}

export async function createBoard(
  projectId: string,
  name: string,
  doc: string,
): Promise<BoardSummary> {
  const { board } = await call<{ board: BoardSummary }>(`/projects/${projectId}/boards`, {
    method: "POST",
    body: JSON.stringify({ name, doc }),
  });
  return board;
}

export async function fetchBoard(id: string): Promise<StoredBoard> {
  const { board } = await call<{ board: StoredBoard }>(`/boards/${id}`);
  return board;
}

/**
 * Saves, carrying the version that was read. A 409 means another tab got there first; the
 * `ApiError` holds the server's current version so the caller can decide rather than guess.
 */
export async function saveBoard(
  id: string,
  version: number,
  doc: string,
  name?: string,
): Promise<number> {
  const { board } = await call<{ board: { version: number } }>(`/boards/${id}`, {
    method: "PUT",
    body: JSON.stringify(name === undefined ? { version, doc } : { version, doc, name }),
  });
  return board.version;
}

export async function deleteBoard(id: string): Promise<void> {
  await call(`/boards/${id}`, { method: "DELETE" });
}

// --- sharing -----------------------------------------------------------------------------

/**
 * Publishing writes a new immutable snapshot and re-aims the board's slug at it, so the link
 * is stable across republishes. An already-published board keeps the slug it has — otherwise
 * republishing would break every link the author has already sent.
 */
export async function publishBoard(id: string): Promise<string> {
  const { slug } = await call<{ slug: string }>(`/boards/${id}/publish`, { method: "POST" });
  return slug;
}

export async function unpublishBoard(id: string): Promise<void> {
  await call(`/boards/${id}/publish`, { method: "DELETE" });
}

/** The one route that answers without a session. Returns only what was published. */
export async function fetchShare(slug: string): Promise<{ name: string; doc: string }> {
  const { share } = await call<{ share: { name: string; doc: string } }>(`/shares/${slug}`);
  return share;
}

/** Where a slug is read back. Absolute, because the point of it is to be sent to someone. */
export const shareUrl = (slug: string): string => `${window.location.origin}/s/${slug}`;
