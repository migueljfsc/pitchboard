/**
 * The board library — projects on the left, their boards on the right.
 *
 * WHY A MODAL AND NOT A PANEL. This started as a dropdown, and a dropdown is the wrong
 * container for a file manager: projects, boards, save state and four actions per row were all
 * competing for one 320px column. Every tool that manages many documents in folders — Figma,
 * Drive, Miro — gives that job a two-pane view with room for a selection and a bulk action.
 *
 * WHY A MODAL AND NOT A PAGE. The editor stays mounted underneath, which is what keeps "save a
 * copy" honest: it saves the document you were just looking at, unsaved edits and all. A real
 * page would either unmount the editor or have to keep it alive anyway, and buy nothing.
 *
 * ONE LIST, NOT ONE PER PROJECT. Every board arrives in a single request and each project's
 * contents are derived from it. Fetching per project meant a cache keyed by project that had to
 * be re-synced after every move — the source of a bug where a saved board made its project look
 * empty. Deriving cannot go stale: there is only one list, and it is refetched whole.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FolderInput,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { PickProject } from "@/components/PickProject";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { CloudBoard } from "@/lib/useCloudBoard";
import { ancestorIds, buildTree, subtreeIds, visibleRows } from "@/lib/projects";
import {
  ApiError,
  type Project,
  type StoredBoardSummary,
  copyBoard,
  createProject,
  deleteBoards,
  deleteProject,
  listAllBoards,
  listProjects,
  moveBoards,
  moveProject,
} from "@/share/api";

/** Codes the Worker emits for these routes; anything else reads as the generic line. */
const KNOWN = new Set([
  "project_limit_reached",
  "project_too_deep",
  "project_cycle",
  "board_limit_reached",
  "invalid_name",
  "invalid_document",
  "invalid_project",
  "invalid_selection",
  "not_found",
  "offline",
]);

const codeOf = (error: unknown) =>
  error instanceof ApiError && KNOWN.has(error.code) ? error.code : "unknown";

/**
 * Mirrors MAX_NAME_CHARS in `worker/lib/limits.ts`. Only used to keep a generated name inside
 * what the Worker accepts — a duplicate refused for a name the user never typed would be a
 * strange way to find out a board's name was long.
 */
const MAX_NAME_CHARS = 100;

type Props = { cloud: CloudBoard };

/** The top-bar button, and the library it opens. */
export function BoardsLibrary({ cloud }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={t("boards.title.hint")}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
      >
        <FolderOpen size={13} />
        {t("boards.title")}
        {(cloud.status.kind === "saving" || cloud.status.kind === "loading") && (
          <Dot className="bg-amber-400" />
        )}
        {cloud.status.kind === "saved" && <Dot className="bg-accent" />}
        {cloud.status.kind === "conflict" && <Dot className="bg-red-400" />}
      </button>

      {/* Unmounted when closed, so every visit starts on a fresh list rather than on
          whatever another device has since changed underneath it. */}
      {open && <Library cloud={cloud} onClose={() => setOpen(false)} />}
    </>
  );
}

type Pending =
  | { kind: "open"; boardId: string }
  | { kind: "boards"; ids: string[] }
  | { kind: "project"; id: string; name: string };

/** What a drag is carrying: rows from the board list, or a folder from the rail. */
type Dragging = { kind: "boards"; ids: string[] } | { kind: "project"; id: string };

/** Where it would land. The root is a target of its own — it un-nests a folder. */
type DropTarget = { kind: "project"; id: string } | { kind: "root" } | null;

function Library({ cloud, onClose }: Props & { onClose: () => void }) {
  const { t, tn } = useI18n();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [boards, setBoards] = useState<StoredBoardSummary[] | null>(null);
  /** Project on show, or null for everything at once. */
  const [active, setActive] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  /** Where a shift-click measures its range from. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** Which row a drag is currently over. */
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  /** Folders whose children are on show. Everything starts folded. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** The "move to" menu, open over the bulk bar. */
  const [picking, setPicking] = useState(false);
  /**
   * What a drag is carrying. Held here rather than in `dataTransfer` because the ids are only
   * readable from that on drop in some browsers, and the rail wants to know during dragover.
   */
  const dragged = useRef<Dragging | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ps, bs] = await Promise.all([listProjects(), listAllBoards()]);
      setProjects(ps);
      setBoards(bs);
      setError(null);
    } catch (cause) {
      setError(codeOf(cause));
    }
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([listProjects(), listAllBoards()])
      .then(([ps, bs]) => {
        if (!live) return;
        setProjects(ps);
        setBoards(bs);
      })
      .catch((cause: unknown) => {
        if (live) setError(codeOf(cause));
      });
    return () => {
      live = false;
    };
  }, []);

  // Escape closes, unless a confirmation is up — then it belongs to that.
  useEffect(() => {
    if (pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (picking) setPicking(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending, picking]);

  const tree = useMemo(() => buildTree(projects ?? []), [projects]);
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded]);

  /**
   * Selecting a folder shows everything filed under it, not only its own boards.
   *
   * A folder that holds nothing but subfolders would otherwise open onto an empty pane,
   * which is a dead end — and this makes "All boards" the same rule applied at the root
   * rather than a special case (D51).
   */
  const scope = useMemo(
    () => (active === null ? null : subtreeIds(projects ?? [], active)),
    [projects, active],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (boards ?? []).filter(
      (b) =>
        (scope === null || scope.has(b.project_id)) &&
        (needle === "" || b.name.toLowerCase().includes(needle)),
    );
  }, [boards, scope, query]);

  /**
   * Counted from the one list, so a move is reflected the moment it lands — and counted
   * over the subtree, so the number on a folder is what opening it will show.
   */
  const countIn = (projectId: string) => {
    const within = subtreeIds(projects ?? [], projectId);
    return (boards ?? []).filter((b) => within.has(b.project_id)).length;
  };

  const activeProject = (projects ?? []).find((p) => p.id === active) ?? null;

  /**
   * Subfolders a delete would take with it.
   *
   * The cascade reaches the whole subtree and every board in it, so the confirmation has to
   * say so — "and every board inside it" is a lie about a folder that holds four more.
   */
  const deletingFolders = (id: string) => subtreeIds(projects ?? [], id).size - 1;

  const toggleFolder = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const nameOf = (id: string) => (boards ?? []).find((b) => b.id === id)?.name ?? "";

  // --- selection ---

  const pick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && anchor) {
      const from = visible.findIndex((b) => b.id === anchor);
      const to = visible.findIndex((b) => b.id === id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelection(new Set(visible.slice(lo, hi + 1).map((b) => b.id)));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      toggle(id);
      return;
    }
    setSelection(new Set([id]));
    setAnchor(id);
  };

  const toggle = (id: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    setAnchor(id);
  };

  const allShown = visible.length > 0 && visible.every((b) => selection.has(b.id));

  const showProject = (id: string | null) => {
    setActive(id);
    // Opening a folder opens the ones above it. Selecting a row that is folded away leaves
    // the rail showing no selection at all while the right pane changes underneath.
    if (id !== null) {
      setExpanded((current) => {
        const next = new Set(current);
        for (const parent of ancestorIds(projects ?? [], id)) next.add(parent);
        return next;
      });
    }
    // A selection is made inside one view; carrying it into another means a bulk action on
    // rows nobody can see.
    setSelection(new Set());
    setPicking(false);
  };

  // --- acting on the selection ---

  /**
   * "{name} (copy)", kept inside the Worker's name cap.
   *
   * Room is made by shortening the ORIGINAL and asking for the name again, never by cutting the
   * finished string: the suffix is translated, it is not always at the end, and trimming the
   * result would eat the one word that says what this board is.
   */
  const copyName = (name: string) => {
    const full = t("boards.copyName", { name });
    if (full.length <= MAX_NAME_CHARS) return full;
    const room = Math.max(1, name.length - (full.length - MAX_NAME_CHARS));
    return t("boards.copyName", { name: name.slice(0, room).trimEnd() });
  };

  /**
   * Duplicate every selected board, each into the project it already lives in.
   *
   * One request per board rather than a bulk route: each copy needs its own name, the name is
   * built here because the Worker has no locale, and duplicating a whole selection is rare
   * enough that the round trips are cheaper than the API surface. The document itself never
   * travels — the server copies it in place.
   */
  const duplicate = async (ids: string[]) => {
    // Collected outside the try so a run that fails halfway still hands back what it made,
    // rather than leaving copies on the server that nothing on screen is pointing at.
    const made: string[] = [];
    try {
      for (const id of ids) made.push((await copyBoard(id, copyName(nameOf(id)))).id);
    } catch (cause) {
      setError(codeOf(cause));
    }
    await refresh();
    // The copies become the selection: they are what you just made and almost certainly what
    // you are about to move, so the alternative is hunting for them in a list that just grew.
    if (made.length > 0) {
      setSelection(new Set(made));
      setAnchor(made[made.length - 1]);
    }
  };

  const move = async (ids: string[], projectId: string) => {
    setPicking(false);
    setDropTarget(null);
    try {
      await moveBoards(ids, projectId);
      // The panel says which project the open board is saved in, and it may have just changed.
      if (cloud.board && ids.includes(cloud.board.id)) cloud.relocate(projectId);
      setSelection(new Set());
      await refresh();
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  /**
   * File a folder under another, or back at the root.
   *
   * The cycle and depth guards are the Worker's — it is the only place that can see the whole
   * tree at once, and a client that checked first would still be racing another tab. So this
   * asks, and reports `project_cycle` or `project_too_deep` like any other refusal.
   */
  const refile = async (id: string, parentId: string | null) => {
    setDropTarget(null);
    try {
      await moveProject(id, parentId);
      // Somewhere to land: a folder dropped into a collapsed one would otherwise vanish.
      if (parentId !== null) setExpanded((current) => new Set(current).add(parentId));
      await refresh();
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  /** What the drag in flight would do here. The rail is the only thing that accepts a drop. */
  const dropOn = async (target: DropTarget) => {
    const carrying = dragged.current;
    dragged.current = null;
    setDropTarget(null);
    if (!carrying || !target) return;

    if (carrying.kind === "boards") {
      // A board belongs to exactly one project, so the root is not a place to put one.
      if (target.kind === "root") return;
      await move(carrying.ids, target.id);
      return;
    }

    const parentId = target.kind === "root" ? null : target.id;
    if (parentId === carrying.id) return;
    await refile(carrying.id, parentId);
  };

  const confirm = async () => {
    if (!pending) return;
    setPending(null);
    try {
      if (pending.kind === "open") {
        await cloud.open(pending.boardId);
        onClose();
        return;
      }
      if (pending.kind === "boards") {
        await deleteBoards(pending.ids);
        // Deleting the board being edited leaves the address pointing at nothing, so the page
        // goes back to a plain editor rather than pretending the row is still there.
        if (cloud.board && pending.ids.includes(cloud.board.id)) {
          window.location.assign("/");
          return;
        }
        setSelection(new Set());
      } else {
        // The whole subtree goes, so both questions below are about the subtree and not
        // about the folder that was clicked. Computed BEFORE the refresh, which is what
        // removes the rows they are asked of.
        const going = subtreeIds(projects ?? [], pending.id);
        await deleteProject(pending.id);
        // The open board's project may be several levels under the one deleted; the cascade
        // took the board with it, and leaving the editor pointing at a row that is gone
        // fails on its next autosave rather than here, where it can be explained.
        if (cloud.board && going.has(cloud.board.projectId)) {
          window.location.assign("/");
          return;
        }
        // Likewise the selection: a folder inside the one deleted is not somewhere to stand.
        if (active !== null && going.has(active)) showProject(null);
      }
      await refresh();
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  /**
   * A new folder lands inside whichever one is open, and at the root from "All boards".
   *
   * Which is what the placeholder says, because it is the one thing here that is modal: the
   * same typing makes a top-level folder or a subfolder depending on what is selected.
   */
  const addProject = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const made = await createProject(name, active);
      setNewName("");
      // Open the parent, or the folder just made is filed somewhere folded shut.
      if (active !== null) setExpanded((current) => new Set(current).add(active));
      await refresh();
      showProject(made.id);
    } catch (cause) {
      setError(codeOf(cause));
    }
  };

  // --- dragging ---

  /**
   * A drag carries the selection if it started on one of its rows, and otherwise just the row
   * it started on — which also becomes the selection, so what is highlighted is what moves.
   */
  const startDrag = (e: React.DragEvent, id: string) => {
    const ids = selection.has(id) ? [...selection] : [id];
    dragged.current = { kind: "boards", ids };
    if (!selection.has(id)) setSelection(new Set([id]));
    e.dataTransfer.effectAllowed = "move";
    // Firefox refuses to begin a drag with an empty payload.
    e.dataTransfer.setData("text/plain", ids.join(" "));
  };

  /** A folder drags too, and carries its whole subtree with it. */
  const startFolderDrag = (e: React.DragEvent, id: string) => {
    dragged.current = { kind: "project", id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const failure = error ?? (cloud.status.kind === "error" ? cloud.status.code : null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        {/* Header: what this is, and how to find something in it. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="library-title" className="text-sm font-semibold text-white">
            {t("boards.title")}
          </h2>
          <div className="relative ml-auto">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("library.search")}
              aria-label={t("library.search")}
              className="w-56 rounded border border-ink-600 bg-ink-900 py-1 pl-7 pr-2 text-[11px] text-ink-200 outline-none transition placeholder:text-ink-500 focus:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("share.close")}
            title={t("share.close")}
            className="rounded p-1 text-ink-400 transition hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        {cloud.status.kind === "conflict" && (
          <div
            role="alert"
            className="shrink-0 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-[11px] text-red-200"
          >
            <p className="font-medium">{t("boards.conflict.title")}</p>
            <p className="mt-0.5 leading-relaxed">{t("boards.conflict.message")}</p>
            <div className="mt-1.5 flex gap-1.5">
              <Small onClick={() => void cloud.overwriteRemote()}>
                {t("boards.conflict.mine")}
              </Small>
              <Small onClick={() => void cloud.acceptRemote()}>{t("boards.conflict.theirs")}</Small>
            </div>
          </div>
        )}

        {failure && (
          <p
            role="alert"
            className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200"
          >
            {t(`boards.error.${failure}` as "boards.error.unknown")}
          </p>
        )}

        <div className="flex min-h-0 flex-1">
          {/* Projects: the filter, and the drop targets. */}
          <div className="flex w-52 shrink-0 flex-col border-r border-ink-700">
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <li>
                {/* Also where a folder is dropped to un-nest it: the root is a real place. */}
                <button
                  type="button"
                  onClick={() => showProject(null)}
                  onDragOver={(e) => {
                    if (dragged.current?.kind !== "project") return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget({ kind: "root" });
                  }}
                  onDragLeave={() =>
                    setDropTarget((c) => (c?.kind === "root" ? null : c))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    void dropOn({ kind: "root" });
                  }}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition",
                    dropTarget?.kind === "root" && "ring-1 ring-accent",
                    active === null
                      ? "bg-accent/15 font-medium text-accent"
                      : "text-ink-300 hover:bg-ink-700/50 hover:text-white",
                  )}
                >
                  <Layers size={12} className="shrink-0" />
                  <span className="truncate">{t("library.all")}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0",
                      active === null ? "text-accent/70" : "text-ink-500",
                    )}
                  >
                    {boards?.length ?? 0}
                  </span>
                </button>
              </li>

              {/* Flat rows, not nested markup: the rail stays one list, so keyboard order and
                  the drop ring behave exactly as they did before folders nested. Depth is an
                  indent, and a folded folder's children are simply not in `rows`. */}
              {rows.map(({ project, depth, hasChildren }) => (
                <li key={project.id}>
                  <div
                    draggable
                    onDragStart={(e) => startFolderDrag(e, project.id)}
                    onDragEnd={() => {
                      dragged.current = null;
                      setDropTarget(null);
                    }}
                    onDragOver={(e) => {
                      // A folder cannot be filed inside itself, so it is not a target for its
                      // own drag. Everything deeper is refused by the Worker, which is the only
                      // place that can see the whole tree.
                      if (dragged.current?.kind === "project" && dragged.current.id === project.id) {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropTarget({ kind: "project", id: project.id });
                    }}
                    onDragLeave={() =>
                      setDropTarget((c) =>
                        c?.kind === "project" && c.id === project.id ? null : c,
                      )
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      void dropOn({ kind: "project", id: project.id });
                    }}
                    style={{ paddingLeft: depth * 12 }}
                    className={cn(
                      "group flex items-center gap-1 rounded pr-1 transition",
                      dropTarget?.kind === "project" &&
                        dropTarget.id === project.id &&
                        "ring-1 ring-accent",
                      active === project.id ? "bg-accent/15" : "hover:bg-ink-700/50",
                    )}
                  >
                    {/* A twisty only where there is something to open, and its own button so
                        opening a folder is not the same click as looking inside it. */}
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleFolder(project.id)}
                        aria-expanded={expanded.has(project.id)}
                        aria-label={t(
                          expanded.has(project.id) ? "boards.collapse" : "boards.expand",
                          { name: project.name },
                        )}
                        className="shrink-0 rounded p-0.5 text-ink-400 transition hover:text-white"
                      >
                        {expanded.has(project.id) ? (
                          <ChevronDown size={11} />
                        ) : (
                          <ChevronRight size={11} />
                        )}
                      </button>
                    ) : (
                      <span className="w-[16px] shrink-0" aria-hidden />
                    )}
                    <button
                      type="button"
                      onClick={() => showProject(project.id)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-[11px] transition",
                        active === project.id
                          ? "font-medium text-accent"
                          : "text-ink-300 hover:text-white",
                      )}
                    >
                      <FolderOpen size={12} className="shrink-0" />
                      <span className="truncate">{project.name}</span>
                      <span
                        className={cn(
                          "ml-auto shrink-0",
                          active === project.id ? "text-accent/70" : "text-ink-500",
                        )}
                      >
                        {countIn(project.id)}
                      </span>
                    </button>
                    <IconButton
                      icon={Trash2}
                      danger
                      label={t("boards.delete")}
                      className="opacity-0 transition group-hover:opacity-100"
                      onClick={() =>
                        setPending({ kind: "project", id: project.id, name: project.name })
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex shrink-0 gap-1.5 border-t border-ink-700 p-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addProject()}
                placeholder={
                  activeProject
                    ? t("boards.newSubproject.placeholder", { name: activeProject.name })
                    : t("boards.newProject.placeholder")
                }
                aria-label={t("boards.newProject")}
                className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 outline-none transition placeholder:text-ink-500 focus:border-accent"
              />
              <Small onClick={() => void addProject()}>
                <Plus size={11} />
              </Small>
            </div>
          </div>

          {/* Boards. */}
          <div className="flex min-w-0 flex-1 flex-col">
            {visible.length > 0 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-ink-700 px-3 py-1.5">
                <Box
                  checked={allShown}
                  label={t("library.selectAll")}
                  onChange={() =>
                    setSelection(allShown ? new Set() : new Set(visible.map((b) => b.id)))
                  }
                />
                <span className="text-[10px] uppercase tracking-wide text-ink-500">
                  {tn("boards.count", visible.length, { count: visible.length })}
                </span>
                <span className="ml-auto text-[10px] text-ink-500">{t("library.openHint")}</span>
              </div>
            )}

            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {boards === null ? (
                <li className="px-2 py-1 text-[11px] text-ink-400">{t("boards.loading")}</li>
              ) : visible.length === 0 ? (
                <li className="px-2 py-1 text-[11px] leading-relaxed text-ink-400">
                  {query.trim() ? t("library.noMatches", { query: query.trim() }) : t("library.empty")}
                </li>
              ) : (
                visible.map((board) => (
                  <li key={board.id}>
                    <div
                      draggable
                      onDragStart={(e) => startDrag(e, board.id)}
                      onDragEnd={() => setDropTarget(null)}
                      onClick={(e) => pick(e, board.id)}
                      onDoubleClick={() => setPending({ kind: "open", boardId: board.id })}
                      className={cn(
                        "group flex cursor-default items-center gap-2 rounded px-2 py-1.5 transition",
                        selection.has(board.id) ? "bg-accent/15" : "hover:bg-ink-700/50",
                      )}
                    >
                      <Box
                        checked={selection.has(board.id)}
                        label={board.name}
                        onChange={() => toggle(board.id)}
                        className={cn(
                          "transition",
                          selection.has(board.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[11px]",
                          cloud.board?.id === board.id ? "text-accent" : "text-ink-200",
                        )}
                      >
                        {board.name}
                      </span>
                      {active === null && (
                        <span className="shrink-0 truncate text-[10px] text-ink-500">
                          {projects?.find((p) => p.id === board.project_id)?.name}
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-ink-500">
                        {when(board.updated_at)}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>

            {/* What can be done to the selection, shown only once there is one. */}
            {selection.size > 0 && (
              <div className="flex shrink-0 items-center gap-2 border-t border-ink-700 bg-ink-900 px-3 py-2">
                <span className="text-[11px] text-ink-200">
                  {tn("library.selected", selection.size, { count: selection.size })}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="relative">
                    <Small onClick={() => setPicking(!picking)}>
                      <FolderInput size={11} />
                      {t("library.moveTo")}
                    </Small>
                    {picking && (
                      <PickProject
                        projects={projects ?? []}
                        onPick={(id) => void move([...selection], id)}
                        onClose={() => setPicking(false)}
                      />
                    )}
                  </div>
                  <Small onClick={() => void duplicate([...selection])}>
                    <Copy size={11} />
                    {t("boards.duplicate")}
                  </Small>
                  <Small
                    danger
                    onClick={() => setPending({ kind: "boards", ids: [...selection] })}
                  >
                    <Trash2 size={11} />
                    {t("boards.delete")}
                  </Small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "open"
              ? t("boards.openConfirm.title")
              : pending.kind === "project"
                ? t("boards.deleteProject.title")
                : tn("library.deleteBoards.title", pending.ids.length, {
                    count: pending.ids.length,
                  })
          }
          message={
            pending.kind === "open"
              ? t("boards.openConfirm.message")
              : pending.kind === "project"
                ? deletingFolders(pending.id) === 0
                  ? t("boards.deleteProject.message", { name: pending.name })
                  : tn("boards.deleteProject.nested", deletingFolders(pending.id), {
                      name: pending.name,
                    })
                : pending.ids.length === 1
                  ? t("boards.deleteBoard.message", { name: nameOf(pending.ids[0]) })
                  : t("library.deleteBoards.message", { count: pending.ids.length })
          }
          confirmLabel={t(pending.kind === "open" ? "boards.openConfirm.confirm" : "boards.delete")}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/** How long ago, in whole units, without pulling in a date library for four cases. */
function when(seconds: number): string {
  const mins = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
}

const Dot = ({ className }: { className: string }) => (
  <span className={cn("ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full", className)} aria-hidden />
);

/** A real checkbox, so the row's selected state is announced rather than only coloured. */
function Box({
  checked,
  label,
  onChange,
  className,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className={cn("size-3 shrink-0 accent-accent", className)}
    />
  );
}

function Small({
  onClick,
  title,
  danger = false,
  children,
}: {
  onClick: () => void;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 text-[10px] transition",
        danger
          ? "border-ink-600 text-ink-300 hover:border-red-500/60 hover:text-red-300"
          : "border-ink-600 text-ink-300 hover:border-accent hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
  className,
}: {
  icon: typeof Trash2;
  label: string;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "shrink-0 rounded border border-transparent p-1 text-ink-500 transition",
        danger ? "hover:border-red-500/50 hover:text-red-300" : "hover:border-accent hover:text-white",
        className,
      )}
    >
      <Icon size={11} />
    </button>
  );
}
