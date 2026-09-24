import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationDash, BoardDoc, PitchView, RunEnd, RunStart, Tool } from "@/board/types";
import { BALL_ID, DEFAULT_PITCH_VIEW } from "@/board/types";
import { BoardCanvas } from "@/components/BoardCanvas";
import { TeamControls } from "@/components/TeamControls";
import { ViewControls, type Ghosts } from "@/components/ViewControls";
import { Section } from "@/components/ui/Section";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Check,
  Command as CommandIcon,
  Download,
  Keyboard,
  Pause,
  Play,
  Presentation,
  Share2,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  RotateCcw,
  Undo2,
  Upload,
  Users,
} from "lucide-react";
import { Inspector } from "@/components/Inspector";
import { DrawingsPanel } from "@/components/DrawingsPanel";
import { ExportDialog } from "@/components/ExportDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { ImportDialog, type ImportKind } from "@/components/ImportDialog";
import { LinkPanel } from "@/components/LinkPanel";
import { DrawPanel } from "@/components/DrawPanel";
import { Timeline } from "@/components/Timeline";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { Toaster } from "@/components/Toaster";
import { BoardTip } from "@/components/BoardTip";
import { useToasts } from "@/lib/useToasts";
import { nudgeEntities, type Carry } from "@/board/interaction";
import { useHistory, type Change } from "@/lib/history";
import { useAutosave } from "@/lib/useAutosave";
import { AUTOSAVE_MS, loadBoard, saveBoard } from "@/share/local";
import { applyPreset, presetFrom, replaceable, type SquadPreset } from "@/share/presets";
import { cn } from "@/lib/utils";
import { MODIFIER } from "@/lib/platform";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { AccountMenu } from "@/components/AccountMenu";
import { BoardsLibrary } from "@/components/BoardsLibrary";
import { SaveBoardButton } from "@/components/SaveBoardButton";
import { AdoptLocalPrompt } from "@/components/AdoptLocalPrompt";
import { useAccount } from "@/lib/useAccount";
import { useCloudBoard } from "@/lib/useCloudBoard";
import { usePresets } from "@/lib/usePresets";
import { useI18n } from "@/i18n/context";
import type { Message } from "@/i18n/core";
import { clearLinks, createLink } from "@/board/links";
import {
  annotationsOf,
  deleteAnnotation,
  duplicateAnnotation,
  sceneRange,
} from "@/board/annotations";
import { concealedPlayers } from "@/board/render";
import { resolveAt } from "@/board/timeline";
import {
  addSceneAfter,
  deleteScene,
  duplicateScene,
  isHighlighted,
  isRunHidden,
  pathOf,
  sceneStartSeconds,
  setCarrier,
  setDelay,
  setHighlight,
  setPath,
  setRunHidden,
  setRunStyle,
  setTravel,
  totalSeconds,
} from "@/board/scenes";
import {
  addPlayer,
  removePlayer,
  setKeeper,
  setPlayerLabel,
  setPlayerNumber,
  switchSide,
} from "@/board/players";
import {
  AWAY,
  FORMATIONS,
  HOME,
  changeFormation,
  createBoardDoc,
  resetPositions,
  type Direction,
} from "@/formations";

/** What a confirmation is currently guarding. */
type Pending =
  | { kind: "reset" }
  | { kind: "positions" }
  | { kind: "links" }
  | { kind: "preset"; preset: SquadPreset; replacing: SquadPreset }
  /** `source` is what the file turned out to be, so the confirmation can say. */
  | { kind: "import"; doc: BoardDoc; source: ImportKind };

/** How long "Saved" stays beside the board's name after an autosave, in milliseconds. */
const SAVED_MS = 1800;

type Props = {
  /**
   * A board to open instead of the autosave — a fork of a shared link. It is
   * already a local copy, so from here it is an ordinary board.
   */
  initialDoc?: BoardDoc;
};

export function Editor({ initialDoc }: Props = {}) {
  const { t, tn, tm } = useI18n();

  // A board is seeded in whatever language it is made in, and keeps those names
  // afterwards. The document is data: it does not change language when the
  // reader does, any more than a team renamed by hand would.
  const homeSpec = () => ({ ...HOME, name: t("doc.home") });
  const awaySpec = () => ({ ...AWAY, name: t("doc.away") });
  const seedLabels = () => ({ board: t("doc.board"), scene: t("doc.scene", { n: 1 }) });
  // The document is the only undoable thing. How you are looking at the board —
  // the framing, the selection, which panel is open — is not an edit, and
  // rewinding it would be its own kind of surprise.
  const {
    state: doc,
    set: commitDoc,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    // Reopen on whatever was last being worked on. A stored board that no
    // longer validates is discarded by loadBoard, so a bad autosave costs a
    // fresh board rather than a broken one.
  } = useHistory<BoardDoc>(
    () => initialDoc ?? loadBoard() ?? createBoardDoc(homeSpec(), awaySpec(), undefined, seedLabels()),
  );
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [chosenScene, setActiveScene] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [pitchView, setPitchView] = useState<PitchView>(DEFAULT_PITCH_VIEW);
  const [pending, setPending] = useState<Pending | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(true);
  // Formations fold away while something is selected, so the Selection panel under
  // them is in reach without scrolling, and come back when the selection clears.
  const [formationsOpen, setFormationsOpen] = useState(true);
  const [formationsFolded, setFormationsFolded] = useState(false);
  // The right rail is the drawing: its tools and everything drawn. It opens with a
  // draw tool or a selected shape, and closes once neither is left.
  const [railOpen, setRailOpen] = useState(false);
  // Presenting is a way of looking at the board, so it is editor state and
  // never reaches the document — the same rule the framing follows (D12).
  const [present, setPresent] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusName, setFocusName] = useState(0);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  // Squad presets live outside the document: they are a library the board draws
  // from, not part of what the board IS. Nothing about them is undoable, and
  // none of it reaches an export or a share link. Where the library lives —
  // this browser or the account — is `usePresets`'s question, asked below once
  // there is an account state to ask it with.
  const [presetError, setPresetError] = useState<Message | null>(null);

  // Drawing. The tool owns what a drag on the grass does; colour and dash are
  // the style the next shape takes, and also restyle the selected one.
  const [tool, setTool] = useState<Tool>("select");
  const [sticky, setSticky] = useState(false);
  const [drawColor, setDrawColor] = useState("#f59e0b");
  // The colour the next halo takes, and the one a swatch restyles the lit ones to.
  // Editor state, exactly like the drawing colour: it is how you are working, not
  // part of what the board is.
  const [highlightColor, setHighlightColor] = useState("#f59e0b");
  const [drawDash, setDrawDash] = useState<AnnotationDash>("solid");
  const [drawFilled, setDrawFilled] = useState(true);
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [focusText, setFocusText] = useState(0);

  // The drawing rail follows whether there is any drawing going on: a tool armed or
  // a shape selected. Judged on what was rendered rather than per setter, because
  // committing a shape selects it and drops back to select in one event, and the
  // rail must see both. Only the change opens or closes it, so it can still be
  // opened by hand to look at the list.
  const drawing = tool !== "select" || annotation !== null;
  const [wasDrawing, setWasDrawing] = useState(drawing);
  if (wasDrawing !== drawing) {
    setWasDrawing(drawing);
    setRailOpen(drawing);
  }

  const directions = useMemo<[Direction, Direction]>(() => [HOME.direction, AWAY.direction], []);
  const total = totalSeconds(doc);

  // The scene list can shrink under the selection — undo, redo, import, reset
  // and deleting a scene all do it. Clamped where it is read rather than synced
  // back into state, so there is no render where the index is out of range.
  const activeScene = Math.min(chosenScene, doc.scenes.length - 1);

  /**
   * Keep the scrubber on the selected scene when the timing moves under it.
   *
   * Flow mode paces each transition by how far everything travels, so ANY edit
   * to a position retimes the animation. The scrubber holds an absolute time, so
   * without this it slides into the middle of a transition: the board then draws
   * interpolated positions that lag behind the cursor while the drag edits the
   * scene you think you are looking at. That is the "player is not dragged with
   * the mouse" bug.
   *
   * Fixed timings cannot drift this way, so this does nothing outside flow mode.
   */
  const pinScrubber = useCallback(
    (next: BoardDoc, scene: number) => {
      if (!playing && next.flow) setTime(sceneStartSeconds(next, scene));
    },
    [playing],
  );

  const setDoc = useCallback<Change<BoardDoc>>(
    (next, merge) => {
      commitDoc(next, merge);
      pinScrubber(next, activeScene);
    },
    [commitDoc, pinScrubber, activeScene],
  );

  // Debounced so a drag, which emits a document per pointermove, does not
  // serialise the whole board forty times a second on the main thread. A save
  // that landed says so beside the name for a moment, and then gets out of the way.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  useAutosave(
    doc,
    (next) => {
      if (!saveBoard(next)) return;
      setJustSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), SAVED_MS);
    },
    AUTOSAVE_MS,
  );

  // Accounts are optional, so none of this is allowed to gate the editor: signed out, the
  // hook resolves to null and the board behaves exactly as it always has (D39). The account
  // is owned here rather than inside the menu because the sync needs it too, and two
  // useAccount() calls would be two /api/me requests that can disagree.
  const accountState = useAccount();
  const cloud = useCloudBoard(doc, setDoc, accountState.account !== null);
  const library = usePresets(accountState.account !== null, accountState.loading);

  // Applying a preset fails here; saving, renaming and deleting one fail inside the library.
  // Both are about the same panel and there is only ever one of them, so they share a line.
  const libraryError = presetError ?? library.error;

  const undo = useCallback(() => {
    pinScrubber(undoHistory(), chosenScene);
  }, [undoHistory, pinScrubber, chosenScene]);

  const redo = useCallback(() => {
    pinScrubber(redoHistory(), chosenScene);
  }, [redoHistory, pinScrubber, chosenScene]);

  /** Say what just happened to the board, and offer to take it back. */
  const notify = useCallback(
    (text: string) => pushToast(text, { label: t("toast.undo"), run: undo }),
    [pushToast, t, undo],
  );

  // The chosen formation lives on the team, not in this component, so a board
  // that arrives by import still knows its own shape.
  const formationOf = (i: 0 | 1) => doc.teams[i].formation ?? (i === 0 ? HOME : AWAY).formation;

  // Scene 0 has no incoming transition, so there is no run to shape there.
  const editScene = activeScene > 0 ? activeScene : undefined;

  // Reference outlines of the neighbouring scenes. Next by default: the run
  // arrows already draw where everyone came FROM, so a ghost behind is mostly
  // the tails again — and a player who does not move has no arrow at all, which
  // is exactly the one a ghost of the next scene reveals, sitting under them.
  const [ghosts, setGhosts] = useState<Ghosts>({ before: false, after: true });

  // How far a move reaches forward. Editing state, not the document: it is how
  // you are working, not part of what a board is.
  const [carry, setCarry] = useState<Carry>("stationary");

  const ghostScenes = useMemo(() => {
    // Nothing to place anything against while it is running, and an outline
    // behind a moving board is noise.
    if (playing) return undefined;
    const out: number[] = [];
    if (ghosts.before && activeScene > 0) out.push(activeScene - 1);
    if (ghosts.after && activeScene + 1 < doc.scenes.length) out.push(activeScene + 1);
    return out.length > 0 ? out : undefined;
  }, [ghosts, playing, activeScene, doc.scenes.length]);

  // Players on a hidden team drop out of the selection rather than being cleared
  // from it: a nudge must not move tokens nobody can see, but unhiding the team
  // should give you your selection back. Players who have been deleted drop out
  // for good.
  const visible = useMemo(() => {
    const concealed = concealedPlayers(doc);
    const live = new Set(doc.teams.flatMap((t) => t.players.map((p) => p.id)));
    live.add(BALL_ID);
    const kept = [...selection].filter((id) => live.has(id) && !concealed.has(id));
    return kept.length === selection.size ? selection : new Set(kept);
  }, [doc, selection]);

  // Adjusted while rendering rather than in an effect: it follows the selection
  // however it changed — a click, a marquee, a link's members, an undo.
  const hasSelection = visible.size > 0;
  const [hadSelection, setHadSelection] = useState(hasSelection);
  if (hadSelection !== hasSelection) {
    setHadSelection(hasSelection);
    if (hasSelection && formationsOpen) {
      setFormationsOpen(false);
      setFormationsFolded(true);
      setSelectionOpen(true);
    } else if (!hasSelection && formationsFolded) {
      setFormationsOpen(true);
      setFormationsFolded(false);
    }
  }

  // Playback. Driven by wall-clock delta rather than a fixed step so the animation
  // runs at the right speed regardless of frame rate.
  const lastFrame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    lastFrame.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastFrame.current) / 1000;
      lastFrame.current = now;

      setTime((t) => {
        const next = t + dt;
        if (next < total) return next;
        if (loop) return total > 0 ? next % total : 0;
        setPlaying(false);
        return total;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, total]);

  /**
   * Starting playback drops the selection back to scene 1.
   *
   * Selecting a later scene arms its editing overlay, which draws the runs into
   * that scene as editable curves. Left armed while the animation plays, those
   * curves hang over every other scene as well and read as arrows belonging
   * nowhere. Scene 1 has no incoming transition, so it arms nothing. The scene
   * strip shows where the playhead has actually reached.
   */
  const setPlayback = useCallback((next: boolean) => {
    setPlaying(next);
    if (next) setActiveScene(0);
  }, []);

  const selectScene = useCallback(
    // `forDoc` matters when the scene list changed in the same event: React has
    // not re-rendered yet, so `doc` here is still the previous version and the
    // scrubber would land at the wrong time.
    (index: number, forDoc?: BoardDoc) => {
      setActiveScene(index);
      setPlaying(false);
      setTime(sceneStartSeconds(forDoc ?? doc, index));
    },
    [doc],
  );

  const onSavePreset = (teamIndex: 0 | 1, label: string) => {
    const preset = presetFrom(doc, teamIndex, library.presets, label);

    // The same name in the same shape is the same squad being saved again. A
    // different shape under that name is a separate preset, so it just adds.
    const replacing = replaceable(library.presets, preset.label, preset.formation);
    if (replacing) {
      setPending({ kind: "preset", preset, replacing });
      return;
    }

    library.add(preset);
    setPresetError(null);
  };

  const replacePreset = (preset: SquadPreset, replacing: SquadPreset) => {
    library.replace(preset, replacing);
    setPresetError(null);
    setPending(null);
  };

  const onApplyPreset = (teamIndex: 0 | 1, id: string) => {
    const preset = library.presets.find((p) => p.id === id);
    if (!preset) return;
    const outcome = applyPreset(doc, teamIndex, preset);
    if (!outcome.ok) {
      setPresetError(outcome.error);
      return;
    }
    setPresetError(null);
    setDoc(outcome.doc);
    // The squad has been rebuilt, so anything selected refers to players who no
    // longer exist under those ids.
    setSelection(new Set());
  };

  const onFormationChange = (teamIndex: 0 | 1, formation: string) => {
    setDoc(changeFormation(doc, teamIndex, formation));
    // The side has been rebuilt, so anything selected on it is stale.
    setSelection(new Set());
  };

  const onNudge = useCallback(
    (metres: number, axis: "x" | "y", mode: Carry) => {
      if (visible.size === 0) return;
      // Held arrow keys collapse into one undo step per direction, the same way
      // a drag does.
      setDoc(
        nudgeEntities(doc, activeScene, visible, metres, axis, mode),
        `nudge:${axis}:${metres}:${mode}`,
      );
    },
    [doc, visible, activeScene, setDoc],
  );

  /**
   * Double-clicking a player on the board is a rename gesture. The canvas has
   * already narrowed the selection to that player; this opens the panel holding
   * the field and asks it for the cursor.
   */
  const onEditName = () => {
    setSelectionOpen(true);
    setFocusName((n) => n + 1);
  };

  /**
   * Placing text is the one tool that commits on the click that starts it, so
   * there is nothing to type into yet. Open the panel and hand it the cursor.
   */
  const selectAnnotation = (id: string | null) => {
    setAnnotation(id);
    if (id !== null && tool === "text") setFocusText((n) => n + 1);
  };

  /**
   * Select a shape from the list on the right.
   *
   * The board only ever draws the scene it is on, so selecting one ranged
   * elsewhere would put handles on something invisible. Jump to where it starts
   * instead — the list is for finding shapes, not just for ticking them off.
   */
  const revealAnnotation = (id: string | null) => {
    setAnnotation(id);
    if (id === null) return;
    const ann = annotationsOf(doc).find((a) => a.id === id);
    if (!ann) return;
    const [start, end] = sceneRange(doc, ann);
    if (activeScene < start || activeScene > end) selectScene(start);
  };

  /**
   * Copy the selected shape and move on to the copy.
   *
   * Selecting the copy rather than leaving the original selected is what makes a
   * duplicate useful: the next thing you do — drag it somewhere, retype the label —
   * is meant for the new one. It lands directly after the original, so it is found
   * by index rather than by searching for an id this side does not mint.
   */
  const onDuplicateAnnotation = (id: string) => {
    const ann = annotationsOf(doc).find((a) => a.id === id);
    if (!ann) return;
    const next = duplicateAnnotation(
      doc,
      id,
      ann.name ? t("doc.shapeCopy", { name: ann.name }) : undefined,
    );
    const copy = annotationsOf(next)[annotationsOf(next).findIndex((a) => a.id === id) + 1];
    setDoc(next);
    if (copy) revealAnnotation(copy.id);
  };

  const onCreateLink = () => {
    const members = [...visible].filter((id) => id !== "ball");
    if (members.length < 2) return;
    const next = createLink(doc, members);
    setDoc(next);
    // Open the new link so its style and order are immediately adjustable.
    setExpandedLink(next.links[next.links.length - 1]?.id ?? null);
  };

  /** Everything a fresh board needs the editor to forget. */
  const clearEditorState = () => {
    setSelection(new Set());
    setAnnotation(null);
    setTool("select");
    setExpandedLink(null);
    setActiveScene(0);
    setTime(0);
    setPlaying(false);
    setPending(null);
  };

  /**
   * The wide reset: a fresh board, keeping only the two formations. The view
   * framing is left alone deliberately — how you are looking at the pitch is not
   * one of the changes you made to it.
   */
  const reset = () => {
    setDoc(
      createBoardDoc(
        { ...homeSpec(), formation: formationOf(0) },
        { ...awaySpec(), formation: formationOf(1) },
        undefined,
        seedLabels(),
      ),
    );
    clearEditorState();
    notify(t("toast.reset"));
  };

  const dropLinks = () => {
    setDoc(clearLinks(doc));
    setExpandedLink(null);
    setPending(null);
    notify(t("toast.linksCleared"));
  };

  /** The narrow one: back to the formation marks, keeping everything else. */
  const restoreShape = () => {
    setDoc(resetPositions(doc));
    setPending(null);
    notify(t("toast.positions"));
  };

  const importDoc = (next: BoardDoc) => {
    setDoc(next);
    clearEditorState();
    setImportOpen(false);
    notify(t("toast.imported", { name: next.name }));
  };

  const removeScene = (index: number) => {
    const name = doc.scenes[index]?.name ?? "";
    const next = deleteScene(doc, index);
    setDoc(next);
    selectScene(Math.max(0, index - 1), next);
    notify(t("toast.sceneDeleted", { name }));
  };

  const addScene = () => {
    const next = addSceneAfter(doc, activeScene, t("doc.scene", { n: doc.scenes.length + 1 }));
    setDoc(next);
    selectScene(activeScene + 1, next);
  };

  const copyScene = () => {
    const scene = doc.scenes[activeScene];
    if (!scene) return;
    const next = duplicateScene(doc, activeScene, t("doc.sceneCopy", { name: scene.name }));
    setDoc(next);
    selectScene(activeScene + 1, next);
  };

  /** Every way of deleting a shape comes through here, so each can be undone. */
  const deleteShape = useCallback(
    (id: string) => {
      setDoc(deleteAnnotation(doc, id));
      if (annotation === id) setAnnotation(null);
      notify(t("toast.shapeDeleted"));
    },
    [doc, annotation, setDoc, notify, t],
  );

  const onRemovePlayer = (id: string) => {
    const player = doc.teams.flatMap((team) => team.players).find((p) => p.id === id);
    setDoc(removePlayer(doc, id));
    if (player) notify(t("toast.playerRemoved", { number: player.number }));
  };

  const onDelayChange = (ms: number | null) => {
    if (editScene === undefined) return;
    let next = doc;
    for (const id of visible) next = setDelay(next, editScene, id, ms);
    setDoc(next, `delay:${editScene}`);
  };

  /** Every selected player's run into this scene; the ball's motion is its own (D45). */
  const onRunStyleChange = (style: { start?: RunStart; end?: RunEnd }) => {
    if (editScene === undefined) return;
    let next = doc;
    for (const id of visible) {
      if (id !== BALL_ID) next = setRunStyle(next, editScene, id, style);
    }
    setDoc(next);
  };

  const onTravelChange = (ms: number | null) => {
    if (editScene === undefined) return;
    let next = doc;
    for (const id of visible) next = setTravel(next, editScene, id, ms);
    setDoc(next, `travel:${editScene}`);
  };

  // The handover carries forward like a move does, and reads the same control —
  // the scenes after this one are usually still the kick-off nobody has said
  // anything about yet. See D43.
  const onCarrierChange = (playerId: string | null) => {
    setDoc(setCarrier(doc, activeScene, playerId, carry));
  };

  /**
   * Straighten only has something to undo where a run was actually bent. A stored
   * path IS the curve — a straight run keeps none — so the button is live exactly
   * when clearing one would change the board.
   */
  const canStraighten =
    editScene !== undefined &&
    [...visible].some((id) => {
      const scene = doc.scenes[editScene];
      return scene !== undefined && pathOf(scene, id) != null;
    });

  const onClearPaths = () => {
    if (editScene === undefined) return;
    let next = doc;
    for (const id of visible) next = setPath(next, editScene, id, null);
    setDoc(next);
  };

  // Every selected entity, or the toggle would read as "hide" while half of them
  // already are.
  const runsHidden =
    editScene !== undefined &&
    visible.size > 0 &&
    [...visible].every((id) => isRunHidden(doc.scenes[editScene], id));

  const onRunsHiddenChange = (hidden: boolean) => {
    if (editScene === undefined) return;
    let next = doc;
    for (const id of visible) next = setRunHidden(next, editScene, id, hidden);
    setDoc(next);
  };

  // activeScene, not editScene: there is no run into the first scene, but there is
  // certainly someone worth watching in it. Every selected entity, for the same
  // reason the run toggle asks for every one — half-lit would read as "off".
  const highlighted =
    visible.size > 0 && [...visible].every((id) => isHighlighted(doc.scenes[activeScene], id));

  const onHighlightChange = (color: string | null) => {
    if (color) setHighlightColor(color);
    setDoc(setHighlight(doc, activeScene, visible, color));
  };

  /**
   * Everything the palette offers. Built when it opens rather than on every render:
   * a list with every formation for both sides is one nobody needs until they ask.
   */
  const commands = (): Command[] => {
    const group = {
      playback: t("palette.group.playback"),
      scenes: t("palette.group.scenes"),
      view: t("palette.group.view"),
      teams: t("palette.group.teams"),
      selection: t("palette.group.selection"),
      draw: t("palette.group.draw"),
      board: t("palette.group.board"),
    };
    const teamName = (i: 0 | 1) =>
      doc.teams[i].name.trim() || t(i === 0 ? "doc.home" : "doc.away");
    const players = [...visible].filter((id) => id !== BALL_ID);

    const list: Command[] = [
      {
        id: "play",
        group: group.playback,
        label: t(playing ? "viewer.pause" : "viewer.play"),
        hint: "Space",
        run: () => setPlayback(!playing),
      },
      {
        id: "loop",
        group: group.playback,
        label: t(loop ? "palette.loop.off" : "palette.loop.on"),
        run: () => setLoop(!loop),
      },
      { id: "present", group: group.playback, label: t("present.enter"), run: () => setPresent(true) },

      ...doc.scenes.map((scene, i) => ({
        id: `scene-${scene.id}`,
        group: group.scenes,
        label: t("timeline.tick", { n: i + 1, name: scene.name }),
        run: () => selectScene(i),
      })),
      { id: "scene-add", group: group.scenes, label: t("timeline.addScene"), run: addScene },
      { id: "scene-copy", group: group.scenes, label: t("timeline.duplicate"), run: copyScene },
    ];
    if (doc.scenes.length > 1) {
      list.push({
        id: "scene-delete",
        group: group.scenes,
        label: t("timeline.deleteScene"),
        run: () => removeScene(activeScene),
      });
    }

    list.push({
      id: "tilt",
      group: group.view,
      label: t(pitchView.tilt ? "palette.view.flat" : "palette.view.3d"),
      run: () => setPitchView({ ...pitchView, tilt: !pitchView.tilt }),
    });
    // Tilt implies a vertical board, so the rotation is not the viewer's to change there.
    if (!pitchView.tilt) {
      list.push({
        id: "rotate",
        group: group.view,
        label: t("palette.view.rotate"),
        run: () => setPitchView({ ...pitchView, rotated: !pitchView.rotated }),
      });
    }
    for (const half of ["full", "left", "right"] as const) {
      list.push({
        id: `half-${half}`,
        group: group.view,
        label: t(`palette.view.${half}`),
        run: () => setPitchView({ ...pitchView, half }),
      });
    }
    list.push(
      {
        id: "ghosts-before",
        group: group.view,
        label: t(ghosts.before ? "palette.ghosts.before.off" : "palette.ghosts.before.on"),
        run: () => setGhosts({ ...ghosts, before: !ghosts.before }),
      },
      {
        id: "ghosts-after",
        group: group.view,
        label: t(ghosts.after ? "palette.ghosts.after.off" : "palette.ghosts.after.on"),
        run: () => setGhosts({ ...ghosts, after: !ghosts.after }),
      },
    );

    for (const i of [0, 1] as const) {
      for (const f of FORMATIONS) {
        list.push({
          id: `formation-${i}-${f.id}`,
          group: group.teams,
          label: t("palette.formation", { team: teamName(i), formation: f.name }),
          run: () => onFormationChange(i, f.id),
        });
      }
    }

    if (players.length === 1) {
      list.push({
        id: "give-ball",
        group: group.selection,
        label: t("palette.giveBall"),
        run: () => onCarrierChange(players[0]),
      });
    }
    if (visible.size > 0) {
      list.push({
        id: "highlight",
        group: group.selection,
        label: t(highlighted ? "palette.highlight.off" : "palette.highlight.on"),
        run: () => onHighlightChange(highlighted ? null : highlightColor),
      });
    }
    if (players.length >= 2) {
      list.push({ id: "link", group: group.selection, label: t("palette.link"), run: onCreateLink });
    }
    if (visible.size > 0) {
      list.push({
        id: "deselect",
        group: group.selection,
        label: t("palette.deselect"),
        run: () => setSelection(new Set()),
      });
    }

    for (const kind of ["arrow", "line", "rect", "ellipse", "pen", "text", "ball"] as const) {
      list.push({
        id: `tool-${kind}`,
        group: group.draw,
        label: t(`draw.tool.${kind}`),
        run: () => setTool(kind),
      });
    }

    list.push(
      { id: "undo", group: group.board, label: t("history.undo"), hint: `${MODIFIER}Z`, run: undo },
      { id: "redo", group: group.board, label: t("history.redo"), hint: `${MODIFIER}⇧Z`, run: redo },
      { id: "export", group: group.board, label: t("bar.export"), run: () => setExportOpen(true) },
      { id: "share", group: group.board, label: t("share.dialog"), run: () => setShareOpen(true) },
      { id: "import", group: group.board, label: t("bar.import"), run: () => setImportOpen(true) },
      {
        id: "shortcuts",
        group: group.board,
        label: t("shortcuts.open"),
        hint: "?",
        run: () => setShortcutsOpen(true),
      },
      {
        id: "reset-positions",
        group: group.board,
        label: t("reset.positions"),
        run: () => setPending({ kind: "positions" }),
      },
      {
        id: "reset-board",
        group: group.board,
        label: t("reset.board"),
        run: () => setPending({ kind: "reset" }),
      },
    );
    return list;
  };

  // Arrow keys nudge the selection: 1 m, or 5 m with shift. Space toggles playback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ahead of the text-field guard: in a field on this page the text IS the
      // document, so undo should mean the board's history, not the input's.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      // Ahead of the field guard too: the palette is reachable from anywhere, and
      // a second press closes it.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (pending || shareOpen || importOpen || exportOpen || shortcutsOpen) return;
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      // A dialog owns the keyboard while it is up — Space must not start
      // playback behind it, and Escape belongs to the dialog.
      if (pending || shareOpen || importOpen || exportOpen || shortcutsOpen || paletteOpen) return;

      // Escape leaves presenting first: there is no tool armed in there, and
      // getting out is the only thing the key can usefully mean.
      if (e.key === "Escape" && present) {
        setPresent(false);
        return;
      }

      // Escape disarms a drawing tool before anything else looks at the key.
      if (e.key === "Escape") {
        setTool("select");
        setAnnotation(null);
        return;
      }

      // The conventional key for "what can I press?", and the list it opens says
      // so, so the shortcut is discoverable from the thing it opens.
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Step through the scenes. The arrows are spoken for by the nudge, and the
      // brackets sit next to each other under the same hand.
      if (e.key === "[" || e.key === "]") {
        const to = activeScene + (e.key === "]" ? 1 : -1);
        if (to < 0 || to >= doc.scenes.length) return;
        e.preventDefault();
        selectScene(to);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && annotation) {
        e.preventDefault();
        deleteShape(annotation);
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setPlayback(!playing);
        return;
      }

      const step = e.shiftKey ? 5 : 1;
      const map: Record<string, [number, "x" | "y"]> = {
        ArrowUp: [-step, "y"],
        ArrowDown: [step, "y"],
        ArrowLeft: [-step, "x"],
        ArrowRight: [step, "x"],
      };
      const move = map[e.key];
      if (!move) return;
      e.preventDefault();
      // Alt confines the move to this scene; without it the edit carries into
      // every following scene the selection does not already travel into.
      onNudge(move[0], move[1], e.altKey ? "scene" : carry);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    carry,
    onNudge,
    pending,
    shareOpen,
    importOpen,
    exportOpen,
    playing,
    setPlayback,
    annotation,
    activeScene,
    selectScene,
    present,
    shortcutsOpen,
    paletteOpen,
    doc,
    setDoc,
    undo,
    redo,
    notify,
    t,
    deleteShape,
  ]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* The board itself — what it is called, and every way it leaves the app.
          A top bar rather than a sidebar section because none of it is editing:
          it is the same handful of actions whatever you are doing below, and
          hunting for them behind a collapsed panel was the wrong trade.

          Gone while presenting, along with both rails: what is left is the board
          and the means to play it. */}
      {!present && (
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-800 px-4 py-2">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight text-white">{t("app.name")}</h1>

        <input
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value }, "board-name")}
          placeholder={t("bar.name.placeholder")}
          aria-label={t("bar.name.label")}
          className="w-56 shrink rounded border border-transparent bg-transparent px-2 py-1 text-xs text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-600 focus:border-accent focus:bg-ink-900"
        />

        <span
          aria-live="polite"
          className={cn(
            "flex shrink-0 items-center gap-1 text-[11px] text-ink-400 transition-opacity duration-500",
            justSaved ? "opacity-100" : "opacity-0",
          )}
        >
          <Check size={12} />
          {t("bar.savedLocally")}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <HistoryButton
            label={t("history.undo")}
            hint={t("history.undo.hint", { keys: `${MODIFIER}Z` })}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={14} />
          </HistoryButton>
          <HistoryButton
            label={t("history.redo")}
            hint={t("history.redo.hint", { keys: `${MODIFIER}⇧Z` })}
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 size={14} />
          </HistoryButton>

          <span className="mx-1 h-5 w-px bg-ink-600" />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("palette.open")}
            title={t("palette.open.title", { keys: `${MODIFIER}K` })}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <CommandIcon size={13} />
            <span className="font-mono text-[11px] text-ink-400">{MODIFIER}K</span>
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            aria-label={t("shortcuts.open")}
            title={t("shortcuts.open.title")}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <Keyboard size={14} />
            {t("shortcuts.open")}
          </button>

          <button
            type="button"
            onClick={() => setPresent(true)}
            title={t("present.enter.title")}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <Presentation size={14} />
            {t("present.enter")}
          </button>

          <button
            type="button"
            onClick={() => setImportOpen(true)}
            title={t("bar.import.title")}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <Upload size={13} />
            {t("bar.import")}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            title={t("bar.export.title")}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <Download size={13} />
            {t("bar.export")}
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            title={t("share.dialog.title")}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <Share2 size={13} />
            {t("share.dialog")}
          </button>

          {accountState.account && <SaveBoardButton cloud={cloud} boardName={doc.name} />}

          <span className="mx-1 h-5 w-px bg-ink-600" />

          {accountState.account && <BoardsLibrary cloud={cloud} />}
          <AdoptLocalPrompt
            cloud={cloud}
            boardName={doc.name}
            signedIn={accountState.account !== null}
            presets={library}
          />
          {/* Signing out resets the editor: the board you had while signed in is not the
              board the next person to open this browser should find. Composed at the call
              site rather than in an effect, which would be a setState during render in all
              but name. */}
          <AccountMenu
            {...accountState}
            signOut={async () => {
              await accountState.signOut();
              // A full navigation rather than a state reset: it drops the board, the undo
              // history that could bring it back, and the /board/<id> in the address, all at
              // once. Anything less leaves one of the three behind.
              window.location.assign("/?fresh=1");
            }}
          />

          {/* Last in the row, always. It is the only control that is about the app rather
              than about the board, and it should not move when signing in adds two more. */}
          <LocaleSwitch />
        </div>
      </header>
      )}

      <div className="flex min-h-0 flex-1">
        {!present && (
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-ink-700 bg-ink-800">
          <Section title={t("section.view")} defaultOpen={false}>
            <ViewControls
              view={pitchView}
              onChange={setPitchView}
              doc={doc}
              onTokenScaleChange={(tokenScale) => setDoc({ ...doc, tokenScale }, "token-scale")}
              onGrassChange={(grass) => setDoc({ ...doc, grass }, "grass")}
              ghosts={ghosts}
              onGhostsChange={setGhosts}
            />
          </Section>

          {/* Both sides in one place: they are set up together and read against
              each other, and two identical panels stacked was twice the chrome
              for the same job. */}
          <Section
            title={t("section.formations")}
            badge={`${formationOf(0)} v ${formationOf(1)}`}
            open={formationsOpen}
            onOpenChange={(open) => {
              setFormationsOpen(open);
              setFormationsFolded(false);
            }}
          >
            <div className="flex flex-col gap-4">
              {([0, 1] as const).map((i) => (
                <div
                  key={doc.teams[i].id}
                  className={cn(i === 1 && "border-t border-ink-700 pt-4")}
                >
                  <TeamControls
                    doc={doc}
                    teamIndex={i}
                    onDocChange={setDoc}
                    formation={formationOf(i)}
                    onFormationChange={onFormationChange}
                    direction={directions[i]}
                    onAddPlayer={(index) => setDoc(addPlayer(doc, index))}
                    presets={library.presets}
                    presetSource={library.source}
                    onSavePreset={onSavePreset}
                    onApplyPreset={onApplyPreset}
                    onRenamePreset={library.rename}
                    onDeletePreset={library.remove}
                  />
                </div>
              ))}
              {libraryError && (
                <p
                  role="alert"
                  className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-red-300"
                >
                  {tm(libraryError)}
                </p>
              )}
            </div>
          </Section>

          <Section
            title={t("section.selection")}
            badge={visible.size ? String(visible.size) : undefined}
            open={selectionOpen}
            onOpenChange={setSelectionOpen}
          >
            <Inspector
              doc={doc}
              selection={visible}
              activeScene={activeScene}
              canEditPaths={editScene !== undefined}
              onCarrierChange={onCarrierChange}
              onClearPaths={onClearPaths}
              canStraighten={canStraighten}
              onRename={(id, label) => setDoc(setPlayerLabel(doc, id, label), `label:${id}`)}
              onRenumber={(id, n) => setDoc(setPlayerNumber(doc, id, n), `number:${id}`)}
              onTravelChange={onTravelChange}
              onDelayChange={onDelayChange}
              onRunStyleChange={onRunStyleChange}
              carry={carry}
              onCarryChange={setCarry}
              onRemovePlayer={onRemovePlayer}
              onSwitchSide={(id) => setDoc(switchSide(doc, id))}
              onMakeKeeper={(id) => setDoc(setKeeper(doc, id))}
              runsHidden={runsHidden}
              onRunsHiddenChange={onRunsHiddenChange}
              highlighted={highlighted}
              highlightColor={highlightColor}
              onHighlightChange={onHighlightChange}
              onGoToScene={(index) => selectScene(index)}
              focusName={focusName}
            />
          </Section>
          <Section title={t("section.links")} badge={String(doc.links.length)} defaultOpen={false}>
            <LinkPanel
              doc={doc}
              onDocChange={setDoc}
              selection={visible}
              onSelectMembers={(members) => setSelection(new Set(members))}
              onCreateFromSelection={onCreateLink}
              onClearAll={() => setPending({ kind: "links" })}
              expanded={expandedLink}
              onExpandedChange={setExpandedLink}
            />
          </Section>

          <div className="mt-auto flex flex-col gap-1.5 border-t border-ink-700 p-4">
            {/* Two resets, because they answer different questions: one puts the
                shape back, the other starts again. */}
            <button
              type="button"
              onClick={() => setPending({ kind: "positions" })}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition hover:border-accent hover:text-white"
            >
              <Users size={13} />
              {t("reset.positions")}
            </button>
            <button
              type="button"
              onClick={() => setPending({ kind: "reset" })}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition hover:border-red-500/60 hover:text-red-400"
            >
              <RotateCcw size={13} />
              {t("reset.board")}
            </button>
          </div>
        </aside>
        )}

        {pending?.kind === "reset" && (
          <ConfirmDialog
            title={t("confirm.reset.title")}
            message={t("confirm.reset.message", { home: formationOf(0), away: formationOf(1) })}
            confirmLabel={t("confirm.reset.action")}
            onConfirm={reset}
            onCancel={() => setPending(null)}
          />
        )}

        {pending?.kind === "positions" && (
          <ConfirmDialog
            title={t("confirm.positions.title")}
            message={t("confirm.positions.message")}
            confirmLabel={t("confirm.positions.action")}
            onConfirm={restoreShape}
            onCancel={() => setPending(null)}
          />
        )}

        {pending?.kind === "links" && (
          <ConfirmDialog
            title={tn("confirm.links.title", doc.links.length)}
            message={t("confirm.links.message")}
            confirmLabel={t("confirm.links.action")}
            onConfirm={dropLinks}
            onCancel={() => setPending(null)}
          />
        )}

        {pending?.kind === "preset" && (
          <ConfirmDialog
            title={t("confirm.preset.title", { label: pending.replacing.label })}
            message={t("confirm.preset.message", { formation: pending.replacing.formation ?? "" })}
            confirmLabel={t("confirm.preset.action")}
            onConfirm={() => replacePreset(pending.preset, pending.replacing)}
            onCancel={() => setPending(null)}
          />
        )}

        {pending?.kind === "import" && (
          <ConfirmDialog
            title={t("confirm.import.title")}
            message={
              // Whole keys per shape rather than a shared sentence with a word swapped
              // in: what a setup costs you is not what a board does.
              pending.source === "tracks"
                ? tn("confirm.import.message.tracks", pending.doc.scenes.length, {
                    name: pending.doc.name,
                  })
                : t(`confirm.import.message.${pending.source}`, { name: pending.doc.name })
            }
            confirmLabel={t("confirm.import.action")}
            onConfirm={() => importDoc(pending.doc)}
            onCancel={() => setPending(null)}
          />
        )}

        {shareOpen && (
          <ShareDialog
            doc={doc}
            view={pitchView}
            cloud={cloud}
            signedIn={accountState.account !== null}
            onClose={() => setShareOpen(false)}
            blocked={pending !== null}
          />
        )}

        {importOpen && (
          <ImportDialog
            onImport={(next, source) => setPending({ kind: "import", doc: next, source })}
            onClose={() => setImportOpen(false)}
            blocked={pending !== null}
          />
        )}

        {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

        {paletteOpen && (
          <CommandPalette commands={commands()} onClose={() => setPaletteOpen(false)} />
        )}

        {exportOpen && (
          <ExportDialog
            doc={doc}
            t={time}
            pitchView={pitchView}
            onClose={() => setExportOpen(false)}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {!present && <BoardTip />}
            {present && (
              <PresentOverlay
                board={doc.name}
                scene={doc.scenes[resolveAt(doc, time).index]?.name ?? ""}
                playing={playing}
                onPlay={() => setPlayback(true)}
              />
            )}
            <Toaster toasts={toasts} onDismiss={dismissToast} />
            <BoardCanvas
              doc={doc}
              t={time}
              interactive={!present}
              sceneIndex={activeScene}
              editScene={present ? undefined : editScene}
              ghosts={ghostScenes}
              pitchView={pitchView}
              selection={visible}
              onSelectionChange={setSelection}
              onDocChange={setDoc}
              onEditName={onEditName}
              carry={carry}
              tool={tool}
              onToolChange={setTool}
              drawColor={drawColor}
              drawDash={drawDash}
              drawFilled={drawFilled}
              sticky={sticky}
              annotationSelection={annotation}
              onAnnotationSelect={selectAnnotation}
            />
          </div>

          {present ? (
            <PresentBar
              scene={doc.scenes[activeScene]?.name ?? ""}
              time={time}
              total={total}
              playing={playing}
              onPlayingChange={setPlayback}
              onTimeChange={setTime}
              onExit={() => setPresent(false)}
            />
          ) : (
            <Timeline
              doc={doc}
              view={pitchView}
              onDocChange={setDoc}
              activeScene={activeScene}
              onActiveSceneChange={selectScene}
              time={time}
              onTimeChange={setTime}
              playing={playing}
              onPlayingChange={setPlayback}
              loop={loop}
              onLoopChange={setLoop}
              onDeleteScene={removeScene}
            />
          )}
        </main>

        {/* The coach's drawing: the tools, and everything drawn. Collapsed until a
            tool is armed or a shape picked — an empty rail is 256px of pitch given
            away for nothing — and closed again once neither is left. */}
        {!present && (
        <aside
          className={cn(
            "flex shrink-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-800 transition-[width]",
            railOpen ? "w-64" : "w-9",
          )}
        >
          <button
            type="button"
            onClick={() => setRailOpen(!railOpen)}
            aria-expanded={railOpen}
            title={railOpen ? t("section.rail.hide") : t("section.rail.show")}
            aria-label={t("section.draw")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 py-2.5 text-ink-300 transition hover:bg-ink-700/40 hover:text-white",
              railOpen ? "px-3" : "flex-col px-2",
            )}
          >
            {railOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            {railOpen ? (
              <span className="flex-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-200">
                {t("section.draw")}
              </span>
            ) : (
              annotationsOf(doc).length > 0 && (
                <span className="font-mono text-[11px] text-ink-400">
                  {annotationsOf(doc).length}
                </span>
              )
            )}
          </button>

          {railOpen && (
            <div className="border-t border-ink-700">
              <div className="border-b border-ink-700 p-4">
                <DrawPanel
                  doc={doc}
                  onDocChange={setDoc}
                  tool={tool}
                  onToolChange={setTool}
                  sticky={sticky}
                  onStickyChange={setSticky}
                  color={drawColor}
                  onColorChange={setDrawColor}
                  dash={drawDash}
                  onDashChange={setDrawDash}
                  filled={drawFilled}
                  onFilledChange={setDrawFilled}
                  selected={annotation}
                  onDuplicate={onDuplicateAnnotation}
                  onDelete={deleteShape}
                  focusText={focusText}
                />
              </div>
              <Section
                title={t("section.drawn")}
                badge={String(annotationsOf(doc).length)}
                flush
              >
                <DrawingsPanel
                  doc={doc}
                  onDocChange={setDoc}
                  sceneIndex={activeScene}
                  selected={annotation}
                  onSelect={revealAnnotation}
                  onDuplicate={onDuplicateAnnotation}
                  onDelete={deleteShape}
                />
              </Section>
            </div>
          )}
        </aside>
        )}
      </div>
    </div>
  );
}

/**
 * What sits over the board while presenting: the board's name and the scene being
 * played, large enough to read from the back of a room, and a big play button
 * whenever it is paused. Nothing here is interactive except that button — the
 * board is being shown, not edited.
 */
function PresentOverlay({
  board,
  scene,
  playing,
  onPlay,
}: {
  board: string;
  scene: string;
  playing: boolean;
  onPlay: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {(board.trim() || scene.trim()) && (
        <div className="pointer-events-none absolute left-5 top-5 z-10 flex max-w-[60%] flex-col gap-1 rounded-lg bg-black/55 px-4 py-3 backdrop-blur-sm">
          {board.trim() && (
            <span className="truncate text-xl font-bold tracking-tight text-white">{board}</span>
          )}
          {scene.trim() && <span className="truncate text-sm text-white/80">{scene}</span>}
        </div>
      )}
      {!playing && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <button
            type="button"
            onClick={onPlay}
            aria-label={t("viewer.play")}
            className="pointer-events-auto flex size-20 items-center justify-center rounded-full bg-accent/90 text-ink-900 shadow-2xl transition hover:scale-105 hover:bg-accent"
          >
            <Play size={34} fill="currentColor" className="ml-1" />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The only chrome left while presenting: what scene you are on, and the means to
 * play it. Deliberately not the Timeline — a scene strip you cannot edit from is
 * a row of buttons that do nothing, and the point of the mode is the board.
 */
function PresentBar({
  scene,
  time,
  total,
  playing,
  onPlayingChange,
  onTimeChange,
  onExit,
}: {
  scene: string;
  time: number;
  total: number;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (t: number) => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-ink-700 bg-ink-800 px-4 py-2.5">
      <button
        type="button"
        onClick={() => onPlayingChange(!playing)}
        aria-label={t(playing ? "viewer.pause" : "viewer.play")}
        title={t(playing ? "viewer.pause" : "viewer.play")}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-ink-900 transition hover:brightness-110"
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>

      <span className="w-32 shrink-0 truncate text-xs text-ink-200">{scene}</span>

      <input
        type="range"
        min={0}
        max={Math.max(total, 0.001)}
        step={0.01}
        value={Math.min(time, total)}
        onChange={(e) => onTimeChange(Number(e.target.value))}
        aria-label={t("timeline.scrub")}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
      />

      <span className="shrink-0 font-mono text-[11px] text-ink-400">
        {time.toFixed(1)}s / {total.toFixed(1)}s
      </span>

      <button
        type="button"
        onClick={onExit}
        title={t("present.exit.title")}
        className="shrink-0 rounded-md border border-ink-600 px-2.5 py-1.5 text-xs text-ink-300 transition hover:border-accent hover:text-white"
      >
        {t("present.exit")}
      </button>
    </div>
  );
}


function HistoryButton({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-ink-600 text-ink-300 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-35"
    >
      {children}
    </button>
  );
}
