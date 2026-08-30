/**
 * Projects, saved boards, and where the board in progress belongs.
 *
 * Only rendered when someone is signed in — accounts are optional (D39), and an empty panel
 * offering to save nowhere is worse than no panel at all.
 *
 * The list is fetched when the panel opens rather than held: it is small, it is stale the
 * moment another device touches it, and nobody opens this often enough for a request to
 * matter. Boards inside a project are fetched when that project is expanded, for the same
 * reason and because the documents are the large part.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, FolderOpen, Plus, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { CloudBoard } from "@/lib/useCloudBoard";
import {
  ApiError,
  type BoardSummary,
  type Project,
  createProject,
  deleteBoard,
  deleteProject,
  listBoards,
  listProjects,
} from "@/share/api";

/** Codes the Worker emits for these routes; anything else reads as the generic line. */
const KNOWN = new Set([
  "project_limit_reached",
  "board_limit_reached",
  "invalid_name",
  "invalid_document",
  "not_found",
  "offline",
]);

const codeOf = (error: unknown) =>
  error instanceof ApiError && KNOWN.has(error.code) ? error.code : "unknown";

type Pending =
  | { kind: "open"; boardId: string }
  | { kind: "board"; id: string; name: string }
  | { kind: "project"; id: string; name: string };

export function BoardsPanel({ cloud, boardName }: { cloud: CloudBoard; boardName: string }) {
  const { t, tn } = useI18n();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [boards, setBoards] = useState<Record<string, BoardSummary[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saved, setSaved] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
      setError(null);
    } catch (cause) {
      setError(codeOf(cause));
    }
  }, []);

  // Loaded on the click that opens the panel rather than in an effect keyed on `open`.
  // Same moment, but it is an event doing the fetching, which is what it actually is.
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void reload();
  };

  // Click-away, suspended while a confirmation is up: the dialog renders outside this
  // subtree, so a click on "Delete" would otherwise close the panel underneath it.
  useEffect(() => {
    if (!open || pending) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, pending]);

  const expand = async (id: string) => {
    setExpanded(expanded === id ? null : id);
    if (boards[id]) return;
    try {
      const rows = await listBoards(id);
      setBoards((all) => ({ ...all, [id]: rows }));
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const project = await createProject(name);
      setProjects((all) => [project, ...(all ?? [])]);
      setNewName("");
      setError(null);
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  /**
   * Creates the board — once. After this the address points at it and every later save is an
   * update, so "Save here" is only ever offered while there is nothing to update.
   */
  const saveHere = async (projectId: string) => {
    await cloud.saveInto(projectId, boardName);
    setBoards((all) => {
      const next = { ...all };
      delete next[projectId];
      return next;
    });
    void reload();
  };

  /**
   * Opening always asks, even when the current board is saved. It replaces what is on screen,
   * and "I was in the middle of that" is not something a click should be able to do quietly —
   * a saved board is safe on the server, but your place in it is not.
   */
  const requestOpen = (boardId: string) => setPending({ kind: "open", boardId });

  const confirm = async () => {
    if (!pending) return;
    setPending(null);
    try {
      if (pending.kind === "open") {
        await cloud.open(pending.boardId);
      } else if (pending.kind === "board") {
        await deleteBoard(pending.id);
        // Deleting the board you are editing leaves the address pointing at nothing, so the
        // page goes back to a plain editor rather than pretending the row is still there.
        if (cloud.board?.id === pending.id) window.location.assign("/");
        setBoards({});
        void reload();
      } else {
        await deleteProject(pending.id);
        if (cloud.board?.projectId === pending.id) window.location.assign("/");
        setBoards({});
        void reload();
      }
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  /**
   * Saving, and saying so.
   *
   * A save that changes nothing on screen reads as a save that did not happen — the same
   * reason the share button says "Link copied" rather than going quiet. The label carries the
   * answer for a few seconds and then goes back to offering the action.
   *
   * The board list is refetched afterwards because a save can carry a RENAME: the document's
   * name goes up with it, so the row underneath is stale the moment it lands.
   */
  const saveNow = async () => {
    await cloud.saveNow();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 4000);
    if (!cloud.board) return;
    try {
      const rows = await listBoards(cloud.board.projectId);
      setBoards((all) => ({ ...all, [cloud.board!.projectId]: rows }));
    } catch {
      // The save is what mattered; a stale row in a list nobody is looking at is not worth
      // a second error message.
    }
  };

  const linkedProject = projects?.find((p) => p.id === cloud.board?.projectId);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("boards.title.hint")}
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-ink-900 px-2.5 py-1.5 text-xs transition",
          open ? "border-accent text-white" : "border-ink-600 text-ink-200 hover:border-accent hover:text-white",
        )}
      >
        <FolderOpen size={13} />
        {t("boards.title")}
        {(cloud.status.kind === "saving" || cloud.status.kind === "loading") && (
          <Dot className="bg-amber-400" />
        )}
        {cloud.status.kind === "saved" && <Dot className="bg-accent" />}
        {cloud.status.kind === "conflict" && <Dot className="bg-red-400" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 flex max-h-[70vh] w-80 flex-col gap-2 overflow-y-auto rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40">
          {/* Where the board in progress stands. */}
          <section className="rounded border border-ink-600 bg-ink-900 p-2">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              {t("boards.current")}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-200">
              {cloud.board
                ? t("boards.savedIn", { project: linkedProject?.name ?? "…" })
                : t("boards.unsaved")}
            </p>
            {cloud.board && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Small onClick={() => void saveNow()}>
                  {saved && <Check size={11} />}
                  {t(saved ? "boards.status.saved" : "boards.saveNow")}
                </Small>
              </div>
            )}
          </section>

          {cloud.status.kind === "conflict" && (
            <section
              role="alert"
              className="rounded border border-red-500/50 bg-red-500/10 p-2 text-[11px] text-red-200"
            >
              <p className="font-medium">{t("boards.conflict.title")}</p>
              <p className="mt-0.5 leading-relaxed">{t("boards.conflict.message")}</p>
              <div className="mt-1.5 flex gap-1.5">
                <Small onClick={() => void cloud.overwriteRemote()}>
                  {t("boards.conflict.mine")}
                </Small>
                <Small onClick={() => void cloud.acceptRemote()}>
                  {t("boards.conflict.theirs")}
                </Small>
              </div>
            </section>
          )}

          {(error ?? (cloud.status.kind === "error" ? cloud.status.code : null)) && (
            <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
              {t(
                `boards.error.${error ?? (cloud.status.kind === "error" ? cloud.status.code : "unknown")}` as "boards.error.unknown",
              )}
            </p>
          )}

          {/* New project. */}
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder={t("boards.newProject.placeholder")}
              aria-label={t("boards.newProject")}
              className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 outline-none transition placeholder:text-ink-500 focus:border-accent"
            />
            <Small onClick={() => void add()}>
              <Plus size={11} />
              {t("boards.create")}
            </Small>
          </div>

          {projects === null ? (
            <p className="px-1 text-[11px] text-ink-400">{t("boards.loading")}</p>
          ) : projects.length === 0 ? (
            <p className="px-1 text-[11px] leading-relaxed text-ink-400">
              {t("boards.noProjects")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {projects.map((project) => (
                <li key={project.id} className="rounded border border-ink-600 bg-ink-900">
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => void expand(project.id)}
                      aria-expanded={expanded === project.id}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] text-ink-200 transition hover:text-white"
                    >
                      {expanded === project.id ? (
                        <ChevronDown size={12} className="shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="shrink-0" />
                      )}
                      <span className="truncate">{project.name}</span>
                      <span className="shrink-0 text-ink-500">
                        {tn("boards.count", project.boards, { count: project.boards })}
                      </span>
                    </button>
                    {!cloud.board && (
                      <Small onClick={() => void saveHere(project.id)}>
                        {t("boards.saveHere")}
                      </Small>
                    )}
                    <IconButton
                      label={t("boards.delete")}
                      onClick={() => setPending({ kind: "project", id: project.id, name: project.name })}
                    />
                  </div>

                  {expanded === project.id && (
                    <ul className="border-t border-ink-700 px-1.5 py-1">
                      {(boards[project.id] ?? []).length === 0 ? (
                        <li className="py-0.5 text-[11px] text-ink-500">{t("boards.noBoards")}</li>
                      ) : (
                        boards[project.id].map((board) => (
                          <li key={board.id} className="flex items-center gap-1 py-0.5">
                            <button
                              type="button"
                              onClick={() => requestOpen(board.id)}
                              className={cn(
                                "min-w-0 flex-1 truncate text-left text-[11px] transition hover:text-white",
                                cloud.board?.id === board.id ? "text-accent" : "text-ink-300",
                              )}
                            >
                              {board.name}
                            </button>
                            <IconButton
                              label={t("boards.delete")}
                              onClick={() =>
                                setPending({ kind: "board", id: board.id, name: board.name })
                              }
                            />
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={t(
            pending.kind === "open"
              ? "boards.openConfirm.title"
              : pending.kind === "board"
                ? "boards.deleteBoard.title"
                : "boards.deleteProject.title",
          )}
          message={
            pending.kind === "open"
              ? t("boards.openConfirm.message")
              : pending.kind === "board"
                ? t("boards.deleteBoard.message", { name: pending.name })
                : t("boards.deleteProject.message", { name: pending.name })
          }
          confirmLabel={t(
            pending.kind === "open" ? "boards.openConfirm.confirm" : "boards.delete",
          )}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

const Dot = ({ className }: { className: string }) => (
  <span className={cn("ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full", className)} aria-hidden />
);

function Small({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex shrink-0 items-center gap-1 rounded border border-ink-600 px-1.5 py-0.5 text-[10px] text-ink-300 transition hover:border-accent hover:text-white"
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="shrink-0 rounded border border-transparent p-1 text-ink-500 transition hover:border-red-500/50 hover:text-red-300"
    >
      <Trash2 size={11} />
    </button>
  );
}
