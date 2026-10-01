import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { AnnotationDash, BoardDoc, PitchView, RunEnd, RunStart, Sport, Tool } from "@/board/types";
import { sportOf } from "@/board/sports";
import { SportMenu } from "@/components/SportMenu";
import { Wordmark } from "@/components/Logo";
import { TabHighlight } from "@/components/ui/TabHighlight";
import { BAR_BUTTON, BAR_BUTTON_OPEN, BAR_DIVIDER } from "@/components/ui/bar";
import { lineNamer } from "@/lib/lineNames";
import { formationLabel } from "@/lib/formationText";
import { loadSport, saveSport } from "@/share/sport";
import { BALL_ID, DEFAULT_PITCH_VIEW, DEFAULT_TOOL, isDrawTool } from "@/board/types";
import { BoardCanvas } from "@/components/BoardCanvas";
import { TeamControls } from "@/components/TeamControls";
import { type Ghosts } from "@/components/ViewControls";
import { BoardViewBar } from "@/components/BoardViewBar";
import { Section } from "@/components/ui/Section";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalSpaceAround,
  ChevronDown,
  CircleDot,
  CircleHelp,
  CircleOff,
  CircleStop,
  Command as CommandIcon,
  Copy,
  FilePlus,
  FolderOpen,
  Eye,
  FileText,
  EyeOff,
  FastForward,
  Goal,
  Link2,
  MousePointer2,
  PencilLine,
  Plus,
  Route,
  Shapes,
  Spline,
  Sparkles,
  Trash2,
  UserMinus,
  History,
  LayoutTemplate,
  Download,
  GraduationCap,
  X,
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
import { CarryMenu, Inspector } from "@/components/Inspector";
import { DrawingsPanel } from "@/components/DrawingsPanel";
import { ExportDialog } from "@/components/ExportDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { ImportDialog, type ImportKind } from "@/components/ImportDialog";
import { LinkCard, LinkPanel } from "@/components/LinkPanel";
import { DrawPanel, DrawToolStrip } from "@/components/DrawPanel";
import { SceneThumb } from "@/components/SceneThumb";
import { SpeedButton, Timeline } from "@/components/Timeline";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { Toaster } from "@/components/Toaster";
import { Tour } from "@/components/Tour";
import { tourSeen } from "@/share/tour";
import { dismissStartHint, startHintDismissed } from "@/share/startHint";
import { TOUR_STEPS, buildTourBoard, type TourStage } from "@/formations/tour";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";
import type { ContextTarget } from "@/components/BoardCanvas";
import { describeChange } from "@/board/describe";
import { SPORT_TEMPLATES, buildTemplate, sportOfTemplate, type TemplateId } from "@/formations/templates";
import { clampSidebar, loadLayout, saveLayout, type Layout } from "@/share/layout";
import { listTemplates, loadTemplate, saveTemplate } from "@/share/templates";
import type { StoredBoardSummary } from "@/share/api";
import { useToasts } from "@/lib/useToasts";
import { useExportJob } from "@/lib/useExportJob";
import { lineUp, nudgeEntities, spaceEvenly, type Carry } from "@/board/interaction";
import { useHistory, type Change } from "@/lib/history";
import { useAutosave } from "@/lib/useAutosave";
import { AUTOSAVE_MS, loadBoard, saveBoard } from "@/share/local";
import {
  applyPreset,
  presetFrom,
  presetsFor,
  replaceable,
  type SquadPreset,
  shapeName,
} from "@/share/presets";
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
  POLYGON_SIDES,
  annotationsOf,
  deleteAnnotation,
  duplicateAnnotation,
  sceneRange,
} from "@/board/annotations";
import { concealedPlayers } from "@/board/render";
import { resolveAt, runEndOf } from "@/board/timeline";
import {
  addSceneAfter,
  canLoft,
  canShoot,
  deleteScene,
  duplicateScene,
  isHighlighted,
  isRunHidden,
  pathOf,
  sceneStartSeconds,
  setCarrier,
  setDelay,
  setHighlight,
  setLoft,
  setPath,
  setRunHidden,
  setShot,
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
  formationsFor,
  sidesFor,
  HOME,
  canResetMove,
  changeFormation,
  hasMovement,
  removeAllMovement,
  resetMove,
  createBoardDoc,
  isUntouched,
  resetPositions,
  type Direction,
  setTeamShape,
  shapeOf,
  seededLinks,
} from "@/formations";
import { APP_PATH, HOME_PATH } from "@/share/routes";
import { countUsage } from "@/share/usage";
import { useFormations } from "@/lib/useFormations";
import { customFormation, formationsOf, sameName, type CustomFormation } from "@/share/formationLibrary";
import { CoffeeLink } from "@/components/CoffeeLink";

/** What a confirmation is currently guarding. */
type Pending =
  | { kind: "reset" }
  | { kind: "sport"; sport: Sport }
  | { kind: "positions" }
  | { kind: "links" }
  | { kind: "preset"; preset: SquadPreset; replacing: SquadPreset }
  /** Saving a drawn formation over one kept under the same name (D122). */
  | { kind: "shape"; teamIndex: 0 | 1; entry: CustomFormation }
  /** `source` is what the file turned out to be, so the confirmation can say. */
  | { kind: "import"; doc: BoardDoc; source: ImportKind };

/** Names are irrelevant where only the tour board's timing is read. */
const TOUR_LABELS = { board: "", scene: () => "", link: "" };

/** The editor's view of the board as it was when the tour opened, put back when it closes. */
type TourRestore = {
  selection: ReadonlySet<string>;
  chosenScene: number;
  time: number;
  playing: boolean;
  formationsOpen: boolean;
  formationsFolded: boolean;
  selectionOpen: boolean;
  linksOpen: boolean;
  railOpen: boolean;
  expandedLink: string | null;
  annotation: string | null;
  hadSelection: boolean;
  wasDrawing: boolean;
  wasPlaying: boolean;
};

/** One step of `,` and `.` — a frame at 30 fps. */
const FRAME_S = 1 / 30;

/** What the board shows as selected while presenting: nothing. */
const NOTHING_SELECTED: ReadonlySet<string> = new Set();

/** The key that arms each tool. The drawn ball has none: B gives the match ball. */
const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "pan",
  a: "arrow",
  l: "line",
  r: "rect",
  o: "ellipse",
  g: "polygon",
  p: "pen",
  t: "text",
};


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
  const homeSpec = (sport?: Sport) => ({ ...sidesFor(sport)[0], name: t("doc.home") });
  const awaySpec = (sport?: Sport) => ({ ...sidesFor(sport)[1], name: t("doc.away") });
  /** A fresh board of `sport`, seeded in the reader's language. */
  const freshBoard = (sport: Sport) =>
    createBoardDoc(homeSpec(sport), awaySpec(sport), undefined, seedLabels(), sport);
  const seedLabels = () => ({ board: t("doc.board"), scene: t("doc.scene", { n: 1 }), line: lineNamer(t) });
  // The document is the only undoable thing. How you are looking at the board —
  // the framing, the selection, which panel is open — is not an edit, and
  // rewinding it would be its own kind of surprise.
  const {
    state: savedDoc,
    set: commitDoc,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    past: historyPast,
    undoSteps,
    undoLatest,
    // Reopen on whatever was last being worked on. A stored board that no
    // longer validates is discarded by loadBoard, so a bad autosave costs a
    // fresh board rather than a broken one.
  } = useHistory<BoardDoc>(
    () => initialDoc ?? loadBoard() ?? freshBoard(loadSport()),
  );
  // While the tour is up the editor draws the tour's board instead, and hands the
  // saved one back untouched when it closes. Only what is drawn swaps: history,
  // the autosave and the cloud sync all hold `savedDoc`, so the tour's board is
  // never written anywhere (D101).
  const [tour, setTour] = useState<{ step: number; restore: TourRestore } | null>(null);
  // Built from the active locale rather than stored, so switching language from the
  // tour's own card renames the board it is showing along with the card.
  const touring = tour !== null;
  const tourBoard = useMemo(
    () =>
      touring
        ? buildTourBoard(
            {
              board: t("tour.board"),
              scene: (n) => t("doc.scene", { n }),
              link: t("tour.board.link"),
            },
            { ...HOME, name: t("doc.home") },
            { ...AWAY, name: t("doc.away") },
          )
        : null,
    [touring, t],
  );
  const doc = tourBoard ?? savedDoc;
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [chosenScene, setActiveScene] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  // How fast playback runs. Editor-only: an export always renders at 1×.
  const [speed, setSpeed] = useState(1);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  // The link last picked on the board. The Selection card shows it while the selection is still
  // exactly its players — a pick selects them first — so any other click hands the card back.
  const [cardLink, setCardLink] = useState<string | null>(null);
  const [pitchView, setPitchView] = useState<PitchView>(DEFAULT_PITCH_VIEW);
  const [pending, setPending] = useState<Pending | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(true);
  const [linksOpen, setLinksOpen] = useState(false);
  // Which side the Formations section is showing.
  const [teamTab, setTeamTab] = useState<0 | 1>(0);
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
  // Counted as it starts, however it was asked for: the button, the menu or the palette.
  useEffect(() => {
    if (present) countUsage("present");
  }, [present]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // A floating menu: the board's right-click, the template picker, or the history.
  const [menu, setMenu] = useState<
    | { kind: "board"; target: ContextTarget; at: { x: number; y: number } }
    | { kind: "templates" | "history" | "help" | "file"; at: { x: number; y: number }; above?: boolean }
    | null
  >(null);
  // The account's own templates, fetched when the template menu opens.
  const [userTemplates, setUserTemplates] = useState<
    { status: "loading" } | { status: "ready"; items: StoredBoardSummary[] } | { status: "error" } | null
  >(null);
  // The selected players' whole path through every scene, drawn faintly.
  const [trailOn, setTrailOn] = useState(false);
  // Sidebar widths, as the reader left them in this browser.
  const [layout, setLayoutState] = useState<Layout>(() => loadLayout());
  const setLayout = useCallback((next: Layout) => {
    setLayoutState(next);
    saveLayout(next);
  }, []);
  const [focusName, setFocusName] = useState(0);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  // Held here rather than in the dialog, so an export carries on when it closes.
  const exportJob = useExportJob();

  // Squad presets live outside the document: they are a library the board draws
  // from, not part of what the board IS. Nothing about them is undoable, and
  // none of it reaches an export or a share link. Where the library lives —
  // this browser or the account — is `usePresets`'s question, asked below once
  // there is an account state to ask it with.
  const [presetError, setPresetError] = useState<Message | null>(null);

  // Drawing. The tool owns what a drag on the grass does; colour and dash are
  // the style the next shape takes, and also restyle the selected one.
  const [tool, setTool] = useState<Tool>(DEFAULT_TOOL);
  const [sticky, setSticky] = useState(false);
  const [drawColor, setDrawColor] = useState("#f59e0b");
  // The colour the next halo takes, and the one a swatch restyles the lit ones to.
  // Editor state, exactly like the drawing colour: it is how you are working, not
  // part of what the board is.
  const [highlightColor, setHighlightColor] = useState("#f59e0b");
  const [drawDash, setDrawDash] = useState<AnnotationDash>("solid");
  const [drawFilled, setDrawFilled] = useState(true);
  const [drawSides, setDrawSides] = useState(POLYGON_SIDES);
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [focusText, setFocusText] = useState(0);

  // The drawing rail follows whether there is any drawing going on: a tool armed or
  // a shape selected. Judged on what was rendered rather than per setter, because
  // committing a shape selects it and drops back to select in one event, and the
  // rail must see both. Only the change opens or closes it, so it can still be
  // opened by hand to look at the list.
  const drawing = isDrawTool(tool) || annotation !== null;
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
  // Pan is offered only while this scene is zoomed in: at 100% there is nowhere to
  // move the view, and the tool did exactly what Select does.
  const zoomed = (doc.scenes[activeScene]?.camera?.zoom ?? 1) > 1;
  const activeTool: Tool = tool === "pan" && !zoomed ? "select" : tool;

  // Pausing settles on the scene the playhead stopped in, however it stopped — the
  // button, Space, the end of the clip. Stopped mid-run, it goes on to where that
  // run ends: a board caught between two scenes shows nothing an edit could land on.
  const [wasPlaying, setWasPlaying] = useState(playing);
  if (wasPlaying !== playing) {
    setWasPlaying(playing);
    if (!playing) {
      const shown = resolveAt(doc, time);
      if (shown.index !== chosenScene) setActiveScene(shown.index);
      if (shown.moving) setTime(sceneStartSeconds(doc, shown.index));
    }
  }

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
  // serialise the whole board forty times a second on the main thread.
  useAutosave(savedDoc, saveBoard, AUTOSAVE_MS);

  // Accounts are optional, so none of this is allowed to gate the editor: signed out, the
  // hook resolves to null and the board behaves exactly as it always has (D39). The account
  // is owned here rather than inside the menu because the sync needs it too, and two
  // useAccount() calls would be two /api/me requests that can disagree.
  const accountState = useAccount();
  const cloud = useCloudBoard(savedDoc, setDoc, accountState.account !== null);
  const library = usePresets(accountState.account !== null, accountState.loading);
  const shapes = useFormations(accountState.account !== null, accountState.loading);

  // Applying a preset fails here; saving, renaming and deleting one fail inside the library.
  // All are about the same panel and there is only ever one of them, so they share a line.
  const libraryError = presetError ?? library.error ?? shapes.error;

  const undo = useCallback(() => {
    pinScrubber(undoHistory(), chosenScene);
  }, [undoHistory, pinScrubber, chosenScene]);

  const redo = useCallback(() => {
    pinScrubber(redoHistory(), chosenScene);
  }, [redoHistory, pinScrubber, chosenScene]);

  /**
   * Say what just happened to the board, and offer to take it back. The Undo acts
   * on the history as it is when CLICKED: the `undo` of the render that raised the
   * notice still holds the stack from before the change, and would go one step too
   * far.
   */
  const notify = useCallback(
    (text: string) => pushToast(text, { label: t("toast.undo"), run: undoLatest }),
    [pushToast, t, undoLatest],
  );

  // The chosen formation lives on the team, not in this component, so a board
  // that arrives by import still knows its own shape.
  const formationOf = (i: 0 | 1) => doc.teams[i].formation ?? sidesFor(doc.sport)[i].formation;
  /** The same, as the reader reads it. */
  /** What a side stands in, as the reader reads it: its drawn shape's name, or its formation. */
  const formationName = (i: 0 | 1) => doc.teams[i].shape?.name ?? formationLabel(t, formationOf(i));

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
  const shownLink = useMemo(() => {
    const link = cardLink ? doc.links.find((l) => l.id === cardLink) : undefined;
    return link && link.members.length === selection.size && link.members.every((id) => selection.has(id))
      ? link
      : null;
  }, [cardLink, doc.links, selection]);
  if (cardLink && !shownLink) setCardLink(null);

  // Adjusted while rendering rather than in an effect: it follows the selection
  // however it changed — a click, a marquee, a link's members, an undo.
  const hasSelection = visible.size > 0;
  const [hadSelection, setHadSelection] = useState(hasSelection);
  if (hadSelection !== hasSelection) {
    setHadSelection(hasSelection);
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
        const next = t + dt * speed;
        if (next < total) return next;
        if (loop) return total > 0 ? next % total : 0;
        setPlaying(false);
        return total;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, total, speed]);

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

  /**
   * Set the editor up for one card of the tour: its panel open and every other one
   * folded, its scene, its selection, and playing if it plays.
   */
  const stageTour = (step: number) => {
    const stage: TourStage = TOUR_STEPS[step].stage;
    setFormationsOpen(stage.panel === "formations");
    setFormationsFolded(false);
    setSelectionOpen(stage.panel === "selection");
    setLinksOpen(stage.panel === "links");
    setRailOpen(stage.panel === "draw");
    setSelection(new Set(stage.select ?? []));
    setExpandedLink(stage.link ?? null);
    setAnnotation(stage.annotation ?? null);
    setMenu(null);
    const scene = stage.play ? 0 : (stage.scene ?? 0);
    setActiveScene(scene);
    // The tour's board, which may not be built yet on the render that opens it. Its
    // timing does not depend on the language it is named in.
    setTime(sceneStartSeconds(tourBoard ?? buildTourBoard(TOUR_LABELS), scene));
    setPlaying(stage.play === true);
  };

  const openTour = () => {
    setTour({
      step: 0,
      // Held as they were, trackers included, so putting them back does not read
      // as a change: the selection returning must not fold Formations again.
      restore: tour?.restore ?? {
        selection,
        chosenScene,
        time,
        playing,
        formationsOpen,
        formationsFolded,
        selectionOpen,
        linksOpen,
        railOpen,
        expandedLink,
        annotation,
        hadSelection,
        wasDrawing,
        wasPlaying,
      },
    });
    stageTour(0);
  };

  const closeTour = () => {
    if (!tour) return;
    const r = tour.restore;
    setTour(null);
    setSelection(r.selection);
    setActiveScene(r.chosenScene);
    setTime(r.time);
    setPlaying(r.playing);
    setFormationsOpen(r.formationsOpen);
    setFormationsFolded(r.formationsFolded);
    setSelectionOpen(r.selectionOpen);
    setLinksOpen(r.linksOpen);
    setRailOpen(r.railOpen);
    setExpandedLink(r.expandedLink);
    setAnnotation(r.annotation);
    setHadSelection(r.hadSelection);
    setWasDrawing(r.wasDrawing);
    setWasPlaying(r.wasPlaying);
  };

  // Where to start, on a board nobody has touched yet — until it is put away for good.
  const [hintDismissed, setHintDismissed] = useState(startHintDismissed);
  const untouched = useMemo(() => !hintDismissed && isUntouched(doc), [hintDismissed, doc]);
  const showStartHint = untouched && !tour && !present;
  const putHintAway = () => {
    dismissStartHint();
    setHintDismissed(true);
  };

  // Up on the first visit to the editor, and on request after that.
  const [tourDue, setTourDue] = useState(() => !tourSeen());
  if (tourDue) {
    setTourDue(false);
    openTour();
  }

  const onSavePreset = (teamIndex: 0 | 1, label: string) => {
    const preset = presetFrom(doc, teamIndex, library.presets, label);

    // The same name in the same shape is the same squad being saved again. A
    // different shape under that name is a separate preset, so it just adds.
    const replacing = replaceable(presetsFor(library.presets, doc.sport), preset.label, shapeName(preset));
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
    const outcome = applyPreset(doc, teamIndex, preset, lineNamer(t));
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

  /**
   * Keep where a side stands in this scene as a formation (D122). Nobody moves: the shape is
   * recorded on the team, so Reset positions returns to it, and kept in the library to pick
   * again. A name already kept in this sport asks before it is replaced.
   */
  const onSaveShape = (teamIndex: 0 | 1, name: string) => {
    const entry = customFormation(shapeOf(doc, teamIndex, activeScene, name), doc.sport ?? "football", shapes.formations);
    if (sameName(shapes.formations, entry.shape.name, doc.sport ?? "football")) {
      setPending({ kind: "shape", teamIndex, entry });
      return;
    }
    keepShape(teamIndex, entry);
  };

  const keepShape = (teamIndex: 0 | 1, entry: CustomFormation) => {
    shapes.save(entry);
    setDoc(setTeamShape(doc, teamIndex, entry.shape));
    setPending(null);
  };

  /** A kept shape, laid out like any formation change. */
  const onApplyShape = (teamIndex: 0 | 1, id: string) => {
    const entry = shapes.formations.find((f) => f.id === id);
    if (!entry) return;
    setDoc(changeFormation(doc, teamIndex, entry.shape, lineNamer(t)));
    setSelection(new Set());
  };

  const onFormationChange = (teamIndex: 0 | 1, formation: string) => {
    setDoc(changeFormation(doc, teamIndex, formation, lineNamer(t)));
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
    setTool(DEFAULT_TOOL);
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
  const shapeSpec = (i: 0 | 1) => {
    const shape = doc.teams[i].shape;
    return shape ? { shape } : {};
  };

  const reset = () => {
    setDoc(
      // A fresh board keeps each side's shape — drawn or from the catalogue (D11, D122).
      createBoardDoc(
        { ...homeSpec(doc.sport), formation: formationOf(0), ...shapeSpec(0) },
        { ...awaySpec(doc.sport), formation: formationOf(1), ...shapeSpec(1) },
        undefined,
        seedLabels(),
        doc.sport,
      ),
    );
    clearEditorState();
    notify(t("toast.reset"));
  };

  /**
   * Start a board of another sport (D113). An untouched board is simply replaced; one
   * with work in it asks first. A board saved to the account is never replaced in
   * place — its autosave would carry the new sport over it — so the new board starts
   * fresh, away from it, as signing out does.
   */
  const switchSport = (sport: Sport, confirmed = false) => {
    if (sport === sportOf(doc).id) return;
    if (!confirmed && !isUntouched(doc)) {
      setPending({ kind: "sport", sport });
      return;
    }
    saveSport(sport);
    setPending(null);
    if (cloud.board) {
      window.location.assign(`${APP_PATH}?fresh=1`);
      return;
    }
    setDoc(freshBoard(sport));
    clearEditorState();
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

  const importDoc = (next: BoardDoc, source: ImportKind) => {
    countUsage(`import.${source}`);
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

  // Players only: the ball's movement is its carrier's, or its own stored position.
  const selectedPlayers = [...visible].filter((id) => id !== BALL_ID);

  /** Take back the selection's moves into this scene, carried as a drag would be. */
  const onResetMove = () => {
    setDoc(resetMove(doc, activeScene, selectedPlayers, carry));
    notify(t("toast.moveReset", { scene: doc.scenes[activeScene]?.name ?? "" }));
  };

  /** Take away every move the selection makes, in every scene. */
  const onRemoveAllMovement = () => {
    setDoc(removeAllMovement(doc, selectedPlayers));
    notify(t("toast.movementRemoved"));
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
  // The colour the selection actually wears here — not the last one picked, which is only
  // what the NEXT highlight takes. Null when they wear different colours: no swatch is true.
  const litColors = new Set([...visible].map((id) => doc.scenes[activeScene]?.highlight?.[id]));
  const litColor = highlighted && litColors.size === 1 ? ([...litColors][0] ?? null) : null;

  const onHighlightChange = (color: string | null) => {
    if (color) setHighlightColor(color);
    setDoc(setHighlight(doc, activeScene, visible, color));
  };

  /**
   * Straighten the selected players into a line, or even the gaps along it — along
   * the way they are already spread, carried as a drag is.
   */
  const onArrange = (how: "line" | "space") => {
    const arrange = how === "line" ? lineUp : spaceEvenly;
    setDoc(arrange(doc, activeScene, selectedPlayers, carry));
  };

  /** "Runs on" for every selected player, or back to a stop if they all run on already. */
  const onToggleRunsOn = () => {
    if (editScene === undefined) return;
    const scene = doc.scenes[editScene];
    const all = selectedPlayers.every((id) => runEndOf(scene, id) === "through");
    onRunStyleChange({ end: all ? "gradual" : "through" });
  };

  /** Replace the board with a ready-made move. Undo brings the old one back. */
  const applyTemplate = (id: TemplateId) => {
    const name = t(`template.${id}`);
    setDoc(
      buildTemplate(
        id,
        { board: name, scene: (n) => t("doc.scene", { n }), line: lineNamer(t) },
        homeSpec(sportOfTemplate(id)),
        awaySpec(sportOfTemplate(id)),
      ),
    );
    clearEditorState();
    notify(t("toast.template", { name }));
  };

  const signedIn = accountState.account !== null;

  /** Open the template picker, fetching the account's own templates as it opens. */
  const openTemplates = (at: { x: number; y: number }, above = false) => {
    setMenu({ kind: "templates", at, above });
    if (!signedIn) return;
    setUserTemplates({ status: "loading" });
    listTemplates(sportOf(doc).id)
      .then((items) => setUserTemplates({ status: "ready", items }))
      .catch(() => setUserTemplates({ status: "error" }));
  };

  /** Start from one of the account's templates. Undo brings the old board back. */
  const applyUserTemplate = (id: string, name: string) => {
    void loadTemplate(id)
      .then((template) => {
        if (!template) {
          pushToast(t("template.user.invalid", { name }));
          return;
        }
        setDoc(template);
        clearEditorState();
        notify(t("toast.template", { name }));
      })
      .catch(() => pushToast(t("template.user.failed")));
  };

  /** Keep this board's setup — its first scene — as a template on the account. */
  const saveAsTemplate = () => {
    void saveTemplate(doc)
      .then(() => pushToast(t("template.saved", { name: doc.name })))
      .catch(() => pushToast(t("template.user.failed")));
  };

  /** This sport's built-in moves, then the account's own, then saving this one. */
  const templateMenu = (): MenuItem[] => {
    const items: MenuItem[] = [
      ...SPORT_TEMPLATES[sportOf(doc).id].map((id: TemplateId) => ({
        label: t(`template.${id}`),
        onSelect: () => applyTemplate(id),
        preview: <TemplatePreview id={id} view={pitchView} />,
      })),
      "divider",
    ];
    if (!signedIn) {
      items.push({ label: t("template.user.signIn"), disabled: true, onSelect: () => {} });
      return items;
    }
    if (!userTemplates || userTemplates.status === "loading") {
      items.push({ label: t("template.user.loading"), disabled: true, onSelect: () => {} });
    } else if (userTemplates.status === "error") {
      items.push({ label: t("template.user.failed"), disabled: true, onSelect: () => {} });
    } else if (userTemplates.items.length === 0) {
      items.push({ label: t("template.user.none"), disabled: true, onSelect: () => {} });
    } else {
      for (const board of userTemplates.items) {
        items.push({ label: board.name, onSelect: () => applyUserTemplate(board.id, board.name) });
      }
    }
    items.push("divider", {
      label: t("template.save"),
      title: t("template.save.hint"),
      onSelect: saveAsTemplate,
    });
    return items;
  };

  /**
   * What a right-click on the board offers, for whatever it landed on. Built when
   * the menu opens, from the selection the click has just made.
   */
  const boardMenu = (target: ContextTarget): MenuItem[] => {
    if (target.kind === "shape") {
      const ann = annotationsOf(doc).find((a) => a.id === target.id);
      if (!ann) return [];
      return [
        { label: t("draw.duplicate"), icon: <Copy size={13} />, onSelect: () => onDuplicateAnnotation(ann.id) },
        {
          label: t(ann.hidden ? "draw.showThis" : "draw.hideThis"),
          icon: ann.hidden ? <Eye size={13} /> : <EyeOff size={13} />,
          onSelect: () =>
            setDoc({
              ...doc,
              annotations: annotationsOf(doc).map((a) =>
                a.id === ann.id ? { ...a, hidden: !a.hidden } : a,
              ),
            }),
        },
        "divider",
        { label: t("draw.delete"), icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteShape(ann.id) },
      ];
    }

    if (target.kind === "board") {
      return [
        { label: t("timeline.addScene"), icon: <Plus size={13} />, onSelect: addScene },
        { label: t("menu.present"), icon: <Presentation size={13} />, onSelect: () => setPresent(true) },
        "divider",
        {
          label: t("template.open"),
          icon: <LayoutTemplate size={13} />,
          onSelect: () => openTemplates(menu?.at ?? { x: 0, y: 0 }),
        },
        {
          label: t("reset.positions"),
          title: t("reset.positions.title"),
          icon: <Users size={13} />,
          onSelect: () => setPending({ kind: "positions" }),
        },
      ];
    }

    const players = selectedPlayers;
    const only = players.length === 1 ? players[0] : null;
    const scene = doc.scenes[activeScene];
    const items: MenuItem[] = [];

    // The ball's travel into this scene, on the ball itself — the same toggles as
    // the scene bar, behind the same gates.
    if (target.id === BALL_ID && scene) {
      items.push(
        {
          label: t(scene.shot ? "menu.shot.off" : "menu.shot.on"),
          title: t(canShoot(doc, activeScene) ? "timeline.shot.can" : "timeline.shot.cannot"),
          icon: <Goal size={13} />,
          disabled: !canShoot(doc, activeScene),
          onSelect: () => setDoc(setShot(doc, activeScene, !scene.shot)),
        },
        {
          label: t(scene.loft ? "menu.loft.off" : "menu.loft.on"),
          title: t(canLoft(doc, activeScene) ? "timeline.loft.can" : "timeline.loft.cannot"),
          icon: <Spline size={13} />,
          disabled: !canLoft(doc, activeScene),
          onSelect: () => setDoc(setLoft(doc, activeScene, !scene.loft)),
        },
      );
      if (scene.carrier) {
        items.push({
          label: t("inspect.ball.release"),
          icon: <CircleOff size={13} />,
          onSelect: () => onCarrierChange(null),
        });
      }
      items.push("divider");
    }

    if (only && scene) {
      const has = scene.carrier === only;
      items.push({
        label: has ? t("inspect.ball.release") : t("menu.giveBall"),
        icon: has ? <CircleOff size={13} /> : <CircleDot size={13} />,
        onSelect: () => onCarrierChange(has ? null : only),
      });
    }
    if (players.length > 0) {
      items.push({
        label: t(activeScene === 0 ? "inspect.resetMove.first" : "inspect.resetMove"),
        icon: <Undo2 size={13} />,
        disabled: !canResetMove(doc, activeScene, players),
        onSelect: onResetMove,
      });
      if (editScene !== undefined && !doc.flow && editScene < doc.scenes.length - 1) {
        const all = players.every((id) => runEndOf(doc.scenes[editScene], id) === "through");
        items.push({
          label: t(all ? "menu.stopHere" : "menu.runOn"),
          icon: all ? <CircleStop size={13} /> : <FastForward size={13} />,
          onSelect: onToggleRunsOn,
        });
      }
    }
    items.push({
      label: t(highlighted ? "menu.unhighlight" : "menu.highlight"),
      icon: <Sparkles size={13} />,
      onSelect: () => onHighlightChange(highlighted ? null : highlightColor),
    });
    if (players.length > 0) {
      items.push({
        label: t(trailOn ? "menu.trail.hide" : "menu.trail.show"),
        icon: <Route size={13} />,
        onSelect: () => setTrailOn(!trailOn),
      });
    }

    if (players.length >= 2) {
      items.push("divider", {
        label: t("menu.lineUp"),
        title: t("menu.lineUp.hint"),
        icon: <AlignVerticalJustifyCenter size={13} />,
        onSelect: () => onArrange("line"),
      });
      if (players.length >= 3) {
        items.push({
          label: t("menu.spaceEvenly"),
          title: t("menu.spaceEvenly.hint"),
          icon: <AlignVerticalSpaceAround size={13} />,
          onSelect: () => onArrange("space"),
        });
      }
      items.push({ label: t("palette.link"), icon: <Link2 size={13} />, onSelect: onCreateLink });
    }

    if (only) {
      items.push(
        "divider",
        { label: t("menu.rename"), icon: <PencilLine size={13} />, onSelect: () => onEditName() },
        {
          label: t("inspect.removeMovement"),
          icon: <RotateCcw size={13} />,
          disabled: !hasMovement(doc, [only]),
          onSelect: onRemoveAllMovement,
        },
        {
          label: t("inspect.remove"),
          icon: <UserMinus size={13} />,
          danger: true,
          onSelect: () => onRemovePlayer(only),
        },
      );
    }
    return items;
  };

  /** The last changes, newest first, each a step back to just after it. */
  /** Help, from the top bar: every action by name, the keys, and the tour. */
  const helpMenu = (): MenuItem[] => [
    {
      label: t("palette.open"),
      title: t("palette.open.title", { keys: `${MODIFIER}K` }),
      icon: <CommandIcon size={13} />,
      hint: `${MODIFIER}K`,
      onSelect: () => setPaletteOpen(true),
    },
    {
      label: t("shortcuts.open"),
      title: t("shortcuts.open.title"),
      icon: <Keyboard size={13} />,
      hint: "?",
      onSelect: () => setShortcutsOpen(true),
    },
    { label: t("tour.open"), title: t("tour.open.title"), icon: <GraduationCap size={13} />, onSelect: openTour },
  ];

  /**
   * A fresh board. One saved to the account is left as it is — resetting it in place would
   * autosave the blank over it — so the editor saves it and starts away from it, as
   * switching sport does. A local board is replaced, behind a confirmation and the Undo.
   */
  const newBoard = async () => {
    if (!cloud.board) {
      setPending({ kind: "reset" });
      return;
    }
    await cloud.saveNow();
    window.location.assign(`${APP_PATH}?fresh=1`);
  };

  const saveCopy = async () => {
    const name = t("file.copyName", { name: doc.name });
    notify(t(await cloud.saveCopy(name) ? "toast.copied" : "toast.copyFailed", { name }));
  };

  /** The board itself: a new one, a saved one, a copy, and in or out as a file. */
  const fileMenu = (): MenuItem[] => [
    { label: t("file.new"), title: t("file.new.title"), icon: <FilePlus size={13} />, onSelect: () => void newBoard() },
    {
      label: t("file.open"),
      title: t(accountState.account ? "file.open.title" : "file.open.signedOut"),
      icon: <FolderOpen size={13} />,
      disabled: !accountState.account,
      onSelect: () => setLibraryOpen(true),
    },
    ...(cloud.board
      ? [{ label: t("file.copy"), title: t("file.copy.title"), icon: <Copy size={13} />, onSelect: () => void saveCopy() }]
      : []),
    "divider",
    { label: t("bar.import"), title: t("bar.import.title"), icon: <Upload size={13} />, onSelect: () => setImportOpen(true) },
    { label: t("bar.export"), title: t("bar.export.title"), icon: <Download size={13} />, onSelect: () => setExportOpen(true) },
    "divider",
    {
      label: t("reset.positions"),
      title: t("reset.positions.title"),
      icon: <Users size={13} />,
      onSelect: () => setPending({ kind: "positions" }),
    },
  ];

  const historyMenu = (): MenuItem[] => {
    const states = [...historyPast, doc];
    const n = historyPast.length;
    if (n === 0) return [{ label: t("history.empty"), disabled: true, onSelect: () => {} }];
    const items: MenuItem[] = [];
    for (let j = n - 1; j >= Math.max(0, n - 20); j--) {
      const steps = n - 1 - j;
      const label = tm(describeChange(states[j], states[j + 1]));
      items.push({
        label: steps === 0 ? `${label} — ${t("history.now")}` : label,
        disabled: steps === 0,
        onSelect: () => pinScrubber(undoSteps(steps), chosenScene),
      });
    }
    items.push("divider", {
      label: t("history.start"),
      onSelect: () => pinScrubber(undoSteps(n), chosenScene),
    });
    return items;
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
      for (const f of formationsFor(doc.sport)) {
        list.push({
          id: `formation-${i}-${f.id}`,
          group: group.teams,
          label: t("palette.formation", { team: teamName(i), formation: formationLabel(t, f.id) }),
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
    if (players.length > 0 && canResetMove(doc, activeScene, players)) {
      list.push({
        id: "reset-move",
        group: group.selection,
        label: t("palette.resetMove"),
        run: onResetMove,
      });
    }
    if (players.length > 0 && hasMovement(doc, players)) {
      list.push({
        id: "remove-movement",
        group: group.selection,
        label: t("palette.removeMovement"),
        run: onRemoveAllMovement,
      });
    }
    if (players.length >= 2) {
      list.push({
        id: "line-up",
        group: group.selection,
        label: t("menu.lineUp"),
        run: () => onArrange("line"),
      });
    }
    if (players.length >= 3) {
      list.push({
        id: "space-evenly",
        group: group.selection,
        label: t("menu.spaceEvenly"),
        run: () => onArrange("space"),
      });
    }
    if (players.length > 0) {
      list.push({
        id: "trail",
        group: group.selection,
        label: t(trailOn ? "menu.trail.hide" : "menu.trail.show"),
        run: () => setTrailOn(!trailOn),
      });
    }
    if (visible.size > 0) {
      list.push({
        id: "deselect",
        group: group.selection,
        label: t("palette.deselect"),
        run: () => setSelection(new Set()),
      });
    }

    for (const kind of ["arrow", "line", "rect", "ellipse", "polygon", "pen", "text", "ball"] as const) {
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
      { id: "tour", group: group.board, label: t("tour.palette"), run: openTour },
      ...(signedIn
        ? [{ id: "template-save", group: group.board, label: t("template.save"), run: saveAsTemplate }]
        : []),
      ...SPORT_TEMPLATES[sportOf(doc).id].map((id: TemplateId) => ({
        id: `template-${id}`,
        group: group.board,
        label: t("palette.template", { name: t(`template.${id}`) }),
        run: () => applyTemplate(id),
      })),
      {
        id: "reset-positions",
        group: group.board,
        label: t("reset.positions"),
        run: () => setPending({ kind: "positions" }),
      },
      {
        id: "reset-board",
        group: group.board,
        label: t("file.new"),
        run: () => void newBoard(),
      },
    );
    return list;
  };

  // Arrow keys nudge the selection: 1 m, or 5 m with shift. Space toggles playback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The tour's board is not the one in the history, so nothing behind the tour
      // may be undone while it shows.
      if (tour) return;
      // Presenting is read-only: the keys play, step and leave, and nothing edits
      // the board behind the audience. The arrows step scenes, as a clicker does.
      if (present) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "Escape") {
          setPresent(false);
          return;
        }
        if (e.code === "Space") {
          e.preventDefault();
          setPlayback(!playing);
          return;
        }
        const scene =
          e.key === "]" || e.key === "ArrowRight" || e.key === "PageDown"
            ? activeScene + 1
            : e.key === "[" || e.key === "ArrowLeft" || e.key === "PageUp"
              ? activeScene - 1
              : null;
        if (scene === null || scene < 0 || scene >= doc.scenes.length) return;
        e.preventDefault();
        selectScene(scene);
        return;
      }
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

      // Escape disarms a drawing tool before anything else looks at the key.
      if (e.key === "Escape") {
        setTool(DEFAULT_TOOL);
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

      // A letter per tool, the conventional ones where there is a convention.
      const armed = !e.metaKey && !e.ctrlKey && !e.altKey ? TOOL_KEYS[e.key.toLowerCase()] : undefined;
      if (armed && (armed !== "pan" || zoomed)) {
        e.preventDefault();
        setTool(armed);
        return;
      }

      // N adds a scene after this one; B gives the ball to the one selected player,
      // or takes it back. Plain keys only: a modifier belongs to the browser.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        const next = addSceneAfter(doc, activeScene, t("doc.scene", { n: doc.scenes.length + 1 }));
        setDoc(next);
        selectScene(activeScene + 1, next);
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "b" || e.key === "B")) {
        const scene = doc.scenes[activeScene];
        const players = [...visible].filter((id) => id !== BALL_ID);
        if (!scene) return;
        e.preventDefault();
        const to =
          players.length === 1
            ? scene.carrier === players[0] ? null : players[0]
            : visible.has(BALL_ID) && scene.carrier ? null : undefined;
        if (to !== undefined) setDoc(setCarrier(doc, activeScene, to, carry));
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
      // The selected players go the same way, as one undo step with one toast.
      if (e.key === "Delete" || e.key === "Backspace") {
        const players = doc.teams.flatMap((team) => team.players).filter((p) => visible.has(p.id));
        if (players.length === 0) return;
        e.preventDefault();
        setDoc(players.reduce((next, p) => removePlayer(next, p.id), doc));
        notify(
          players.length === 1
            ? t("toast.playerRemoved", { number: players[0].number })
            : t("toast.playersRemoved", { count: players.length }),
        );
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setPlayback(!playing);
        return;
      }

      // One frame at a time, for checking exactly when a pass is met or a run sets
      // off. Shift steps ten. Pauses first: stepping a running clip means nothing.
      if (e.key === "," || e.key === "." || e.key === "<" || e.key === ">") {
        e.preventDefault();
        const back = e.key === "," || e.key === "<";
        const frames = e.shiftKey ? 10 : 1;
        setPlaying(false);
        setTime((now) => Math.min(Math.max(now + (back ? -1 : 1) * frames * FRAME_S, 0), total));
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
    tour,
    doc,
    setDoc,
    undo,
    redo,
    notify,
    t,
    deleteShape,
    total,
    visible,
    zoomed,
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
      <header className="relative z-30 flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-800 px-4 py-2 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]">

        <h1 className="shrink-0">
          <a href={HOME_PATH} title={t("app.name")} className="rounded-lg">
            <Wordmark name={t("app.name")} />
          </a>
        </h1>

        <input
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value }, "board-name")}
          placeholder={t("bar.name.placeholder")}
          aria-label={t("bar.name.label")}
          className="w-56 min-w-24 shrink rounded border border-transparent bg-transparent px-2 py-1 text-xs text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-600 focus:border-accent focus:bg-ink-900"
        />

        <SportMenu
          value={sportOf(doc).id}
          onChange={(sport) => switchSport(sport)}
          nameOf={(sport) => t(`sport.${sport}`)}
          label={t("bar.sport.label")}
          hint={t("bar.sport.hint")}
          disabled={touring}
        />

        {/* An export carrying on behind the board: how far it has got, and the file
            once it is done. Click to reopen the dialog. */}
        {!exportOpen && (exportJob.running || exportJob.saved || exportJob.error) && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-[11px]",
              exportJob.error ? "border-red-500/50 text-red-300" : "border-ink-600 text-ink-200",
            )}
          >
            <button type="button" onClick={() => setExportOpen(true)} className="flex items-center gap-1.5">
              {exportJob.running ? (
                <>
                  {t("export.status", {
                    format: exportJob.running.format.toUpperCase(),
                    percent: Math.round(exportJob.running.fraction * 100),
                  })}
                  {/* The bar beside the number it is showing. */}
                  <span
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(exportJob.running.fraction * 100)}
                    className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-700"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, exportJob.running.fraction * 100)}%` }}
                    />
                  </span>
                  {exportJob.running.onPage && (
                    <span className="text-amber-300" title={t("export.onPage.hint")}>
                      {t("export.onPage")}
                    </span>
                  )}
                </>
              ) : exportJob.error ? (
                t("export.status.failed", { message: exportJob.error })
              ) : (
                t("export.status.done", { file: exportJob.saved ?? "" })
              )}
            </button>
            {exportJob.saved && !exportJob.running && (
              <button
                type="button"
                onClick={exportJob.downloadAgain}
                className="text-accent transition hover:brightness-110"
              >
                {t("export.status.again")}
              </button>
            )}
            <button
              type="button"
              aria-label={t(exportJob.running ? "export.cancel" : "toast.dismiss")}
              title={t(exportJob.running ? "export.cancel" : "toast.dismiss")}
              onClick={exportJob.running ? exportJob.cancel : exportJob.forget}
              className="text-ink-400 transition hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-ink-700 bg-ink-900/60 p-0.5">
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
          <HistoryButton
            label={t("history.open")}
            hint={t("history.open.title")}
            disabled={!canUndo}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ kind: "history", at: { x: r.left, y: r.bottom + 4 } });
            }}
          >
            <History size={14} />
          </HistoryButton>
          </div>

          <span className={BAR_DIVIDER} />

          {/* The help there is, in one place: finding an action, the keys, and the tour.
              The tour points here when it says where it can be found again. */}
          <div className="relative">
            <MenuButton
              tour="tour"
              icon={<CircleHelp size={14} />}
              label={t("bar.help")}
              hint={t("bar.help.title")}
              open={menu?.kind === "help"}
              onOpen={(at) => setMenu(menu?.kind === "help" ? null : { kind: "help", at })}
            />
            {showStartHint && menu?.kind !== "help" && <StartHint onDismiss={putHintAway} />}
          </div>

          <span className={BAR_DIVIDER} />

          <button
            type="button"
            data-tour="present"
            onClick={() => setPresent(true)}
            aria-label={t("present.enter")}
            title={t("present.enter.title")}
            className={BAR_BUTTON}
          >
            <Presentation size={14} />
            {t("present.enter")}
          </button>

          {/* Getting a board in or out as a file. Present, Share and Save are what a coach
              reaches for, and stay out on the bar. */}
          <MenuButton
            tour="export"
            icon={<FileText size={14} />}
            label={t("bar.file")}
            hint={t("bar.file.title")}
            open={menu?.kind === "file"}
            onOpen={(at) => setMenu(menu?.kind === "file" ? null : { kind: "file", at })}
          />
          <button
            type="button"
            data-tour="share"
            onClick={() => setShareOpen(true)}
            title={t("share.dialog.title")}
            className={BAR_BUTTON}
          >
            <Share2 size={13} />
            {t("share.dialog")}
          </button>

          {accountState.account && (
            <SaveBoardButton cloud={cloud} boardName={doc.name} sport={sportOf(doc).id} />
          )}

          <span className={BAR_DIVIDER} />

          {accountState.account && (
            <BoardsLibrary
              cloud={cloud}
              sport={sportOf(doc).id}
              boardName={doc.name}
              open={libraryOpen}
              onOpenChange={setLibraryOpen}
            />
          )}
          <AdoptLocalPrompt
            cloud={cloud}
            boardName={doc.name}
            sport={sportOf(doc).id}
            signedIn={accountState.account !== null}
            presets={library}
            formations={shapes}
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

          <span className={BAR_DIVIDER} />

          {/* The last control in the row. It is the only one about the app rather than the
              board, and it should not move when signing in adds two more. */}
          <LocaleSwitch />

          {/* Not a control, so it sits past the controls, behind a divider and as an icon only:
              it must never be mistaken for, or crowd, a feature. A plain link in the app's
              accent rather than Buy Me a Coffee's embed script — a script tag in React never
              runs, and theirs would send every visitor's IP to a third party. */}
          <span className={BAR_DIVIDER} />
          <CoffeeLink />
        </div>
      </header>
      )}

      <div className="flex min-h-0 flex-1">
        {!present && (
        <aside
          style={{ width: layout.left }}
          className="flex shrink-0 flex-col border-r border-ink-700 bg-ink-800"
        >
          {/* The board's setup, as tall as it is and scrolling once it is taller than there is room
              for: the teams, then the links between them. */}
          <div className="min-h-0 shrink overflow-y-auto">
          {/* Both sides in one section, one at a time: a tab per side, like the
              Selection panel's, so the section is half the height it was with the
              two stacked. */}
          <Section
            title={t("section.formations")}
            icon={<Users size={13} />}
            tour="formations"
            badge={`${formationName(0)} v ${formationName(1)}`}
            open={formationsOpen}
            onOpenChange={(open) => {
              setFormationsOpen(open);
              setFormationsFolded(false);
            }}
          >
            <div className="flex flex-col gap-3">
              <div role="tablist" className="flex gap-1 rounded-md bg-ink-900 p-0.5">
                {([0, 1] as const).map((i) => (
                  <button
                    key={doc.teams[i].id}
                    type="button"
                    role="tab"
                    aria-selected={teamTab === i}
                    onClick={() => setTeamTab(i)}
                    className={cn(
                      "relative isolate flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] transition",
                      teamTab === i ? "text-white" : "text-ink-400 hover:text-ink-200",
                    )}
                  >
                    {teamTab === i && <TabHighlight id="team-tab" />}
                    <span
                      className="size-2 shrink-0 rounded-full ring-1 ring-white/20"
                      style={{ background: doc.teams[i].color }}
                    />
                    <span className="truncate">{doc.teams[i].name || formationName(i)}</span>
                  </button>
                ))}
              </div>
              {([teamTab] as const).map((i) => (
                <div key={doc.teams[i].id}>
                  <TeamControls
                    doc={doc}
                    teamIndex={i}
                    onDocChange={setDoc}
                    formation={formationOf(i)}
                    onFormationChange={onFormationChange}
                    direction={directions[i]}
                    onAddPlayer={(index) => setDoc(addPlayer(doc, index))}
                    presets={presetsFor(library.presets, doc.sport)}
                    presetSource={library.source}
                    onSavePreset={onSavePreset}
                    onApplyPreset={onApplyPreset}
                    onRenamePreset={library.rename}
                    onDeletePreset={library.remove}
                    shapes={formationsOf(shapes.formations, doc.sport)}
                    shapeSource={shapes.source}
                    onApplyShape={onApplyShape}
                    onSaveShape={onSaveShape}
                    onRenameShape={shapes.rename}
                    onDeleteShape={shapes.remove}
                    selection={visible}
                    onSelectPlayer={(id) => setSelection(new Set([id]))}
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
              {/* Beside the formations it puts everyone back on: where a coach looks for it. */}
              <button
                type="button"
                onClick={() => setPending({ kind: "positions" })}
                title={t("reset.positions.title")}
                className="flex items-center justify-center gap-1.5 rounded-md border border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition hover:border-accent hover:text-white"
              >
                <RotateCcw size={13} />
                {t("reset.positions")}
              </button>
            </div>
          </Section>

          <Section
            title={t("section.links")}
            icon={<Link2 size={13} />}
            tour="links"
            badge={String(doc.links.length)}
            open={linksOpen}
            onOpenChange={setLinksOpen}
          >
            <LinkPanel
              doc={doc}
              onDocChange={setDoc}
              selection={visible}
              onSelectMembers={(members) => setSelection(new Set(members))}
              onCreateFromSelection={onCreateLink}
              onClearAll={() => setPending({ kind: "links" })}
              expanded={expandedLink}
              onExpandedChange={setExpandedLink}
              sceneIndex={activeScene}
              teamLabel={(i) => doc.teams[i].name || formationName(i)}
              seeded={(i) => seededLinks(doc, i, lineNamer(t))}
            />
          </Section>

          </div>

          {/* Whatever is selected, filling the rest of the column: its height follows the sections
              above it, never the selection, so nothing moves as the selection changes; a long
              inspector scrolls inside it. Folded, it is its header and the setup has the column. */}
          <section
            data-tour="selection"
            className={cn(
              "flex flex-col border-t border-ink-600 bg-ink-900/40 shadow-[0_-8px_16px_-12px_rgb(0_0_0/0.6)]",
              selectionOpen ? "min-h-64 flex-1" : "shrink-0",
            )}
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900/70 pr-3 transition hover:bg-ink-700/60">
              <button
                type="button"
                onClick={() => setSelectionOpen(!selectionOpen)}
                aria-expanded={selectionOpen}
                className="flex shrink-0 flex-1 items-center gap-2 py-2.5 pl-3 text-left"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-ink-700 text-ink-200">
                  <ChevronDown
                    size={13}
                    className={cn("transition-transform duration-200 ease-(--ease-out)", !selectionOpen && "-rotate-90")}
                  />
                </span>
                <MousePointer2 size={13} className={cn("shrink-0", selectionOpen ? "text-accent" : "text-ink-400")} />
                <span className="flex-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-white">
                  {t("section.selection")}
                </span>
                {!selectionOpen && visible.size > 0 && (
                  <span className="font-mono text-[11px] text-ink-400">{visible.size}</span>
                )}
              </button>
              <CarryMenu carry={carry} onChange={setCarry} />
            </header>
            {selectionOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
              {shownLink ? (
                <LinkCard
                  doc={doc}
                  linkId={shownLink.id}
                  onDocChange={setDoc}
                  sceneIndex={activeScene}
                  onPlayers={() => setCardLink(null)}
                />
              ) : (
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
                onRemovePlayer={onRemovePlayer}
                onSwitchSide={(id) => setDoc(switchSide(doc, id))}
                onMakeKeeper={(id) => setDoc(setKeeper(doc, id))}
                runsHidden={runsHidden}
                onRunsHiddenChange={onRunsHiddenChange}
                highlighted={highlighted}
                highlightColor={litColor}
                onHighlightChange={onHighlightChange}
                onGoToScene={(index) => selectScene(index)}
                onResetMove={onResetMove}
                canResetMove={canResetMove(doc, activeScene, selectedPlayers)}
                onRemoveAllMovement={onRemoveAllMovement}
                hasMovement={hasMovement(doc, selectedPlayers)}
                trailOn={trailOn}
                onTrailChange={setTrailOn}
                focusName={focusName}
              />
              )}
            </div>
            )}
          </section>
        </aside>
        )}

        <AnimatePresence>
          {pending?.kind === "reset" && (
            <ConfirmDialog
              key="reset"
              title={t("confirm.reset.title")}
              message={t("confirm.reset.message", { home: formationName(0), away: formationName(1) })}
              confirmLabel={t("confirm.reset.action")}
              onConfirm={reset}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "sport" && (
            <ConfirmDialog
              key="sport"
              title={t("confirm.sport.title", { sport: t(`sport.${pending.sport}.lower`) })}
              message={t("confirm.sport.message", { sport: t(`sport.${pending.sport}.lower`) })}
              confirmLabel={t("confirm.sport.action")}
              onConfirm={() => switchSport(pending.sport, true)}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "positions" && (
            <ConfirmDialog
              key="positions"
              title={t("confirm.positions.title")}
              message={t("confirm.positions.message")}
              confirmLabel={t("confirm.positions.action")}
              onConfirm={restoreShape}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "links" && (
            <ConfirmDialog
              key="links"
              title={tn("confirm.links.title", doc.links.length)}
              message={t("confirm.links.message")}
              confirmLabel={t("confirm.links.action")}
              onConfirm={dropLinks}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "preset" && (
            <ConfirmDialog
              key="preset"
              title={t("confirm.preset.title", { label: pending.replacing.label })}
              message={t("confirm.preset.message", {
                formation: pending.replacing.shape?.name ?? formationLabel(t, pending.replacing.formation ?? ""),
              })}
              confirmLabel={t("confirm.preset.action")}
              onConfirm={() => replacePreset(pending.preset, pending.replacing)}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "shape" && (
            <ConfirmDialog
              key="shape"
              title={t("confirm.shape.title", { name: pending.entry.shape.name })}
              message={t("confirm.shape.message")}
              confirmLabel={t("confirm.shape.action")}
              onConfirm={() => keepShape(pending.teamIndex, pending.entry)}
              onCancel={() => setPending(null)}
            />
          )}

          {pending?.kind === "import" && (
            <ConfirmDialog
              key="import"
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
              onConfirm={() => importDoc(pending.doc, pending.source)}
              onCancel={() => setPending(null)}
            />
          )}

          {shareOpen && (
            <ShareDialog
              key="share"
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
              key="import-dialog"
              onImport={(next, source) => setPending({ kind: "import", doc: next, source })}
              onClose={() => setImportOpen(false)}
              blocked={pending !== null}
            />
          )}

          {shortcutsOpen && (
            <ShortcutsDialog
              key="shortcuts"
              onClose={() => setShortcutsOpen(false)}
              onTour={() => {
                setShortcutsOpen(false);
                openTour();
              }}
            />
          )}

          {tour && !present && (
            <Tour
              key="tour"
              step={tour.step}
              onStep={(step) => {
                setTour({ ...tour, step });
                stageTour(step);
              }}
              onClose={closeTour}
            />
          )}

          {menu && (
            <ContextMenu
              key="menu"
              at={menu.at}
              above={menu.kind !== "board" && menu.above}
              onClose={() => setMenu(null)}
              items={
                menu.kind === "board"
                  ? boardMenu(menu.target)
                  : menu.kind === "history"
                    ? historyMenu()
                    : menu.kind === "help"
                      ? helpMenu()
                      : menu.kind === "file"
                        ? fileMenu()
                        : templateMenu()
              }
            />
          )}

          {paletteOpen && (
            <CommandPalette key="palette" commands={commands()} onClose={() => setPaletteOpen(false)} />
          )}

          {exportOpen && (
            <ExportDialog
              key="export"
              doc={doc}
              t={time}
              pitchView={pitchView}
              onClose={() => setExportOpen(false)}
              exportJob={exportJob}
            />
          )}
        </AnimatePresence>

        {!present && (
          <SidebarHandle
            side="left"
            width={layout.left}
            onChange={(left) => setLayout({ ...layout, left })}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div data-tour="board" className="relative min-h-0 flex-1">
            {present && (
              <PresentOverlay
                board={doc.name}
                scene={doc.scenes[resolveAt(doc, time).index]?.name ?? ""}
                note={doc.scenes[resolveAt(doc, time).index]?.note ?? ""}
                playing={playing}
                onPlay={() => setPlayback(true)}
              />
            )}
            <Toaster toasts={toasts} onDismiss={dismissToast} />
            {!present && (
              <BoardViewBar
                view={pitchView}
                onChange={setPitchView}
                doc={doc}
                onTokenScaleChange={(tokenScale) => setDoc({ ...doc, tokenScale }, "token-scale")}
                onGrassChange={(grass) => setDoc({ ...doc, grass }, "grass")}
                ghosts={ghosts}
                onGhostsChange={setGhosts}
              />
            )}
            <BoardCanvas
              doc={doc}
              t={time}
              interactive={!present}
              sceneIndex={activeScene}
              editScene={present ? undefined : editScene}
              ghosts={ghostScenes}
              pitchView={pitchView}
              selection={present ? NOTHING_SELECTED : visible}
              onSelectionChange={setSelection}
              onDocChange={setDoc}
              onEditName={onEditName}
              carry={carry}
              tool={activeTool}
              onToolChange={setTool}
              drawColor={drawColor}
              drawDash={drawDash}
              drawFilled={drawFilled}
              drawSides={drawSides}
              sticky={sticky}
              annotationSelection={present ? null : annotation}
              onAnnotationSelect={selectAnnotation}
              onLinkPick={setCardLink}
              trail={trailOn && !present ? selectedPlayers : undefined}
              sceneCamera={playing || present}
              playing={playing}
              onEditStart={(index) => selectScene(index)}
              onContextMenu={(target, at) => setMenu({ kind: "board", target, at })}
            />
          </div>

          {present ? (
            <PresentBar
              speed={speed}
              onSpeedChange={setSpeed}
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
              speed={speed}
              onSpeedChange={setSpeed}
              onDeleteScene={removeScene}
            />
          )}
        </main>

        {!present && railOpen && (
          <SidebarHandle
            side="right"
            width={layout.right}
            onChange={(right) => setLayout({ ...layout, right })}
          />
        )}

        {/* The coach's drawing: the tools, and everything drawn. Collapsed until a
            tool is armed or a shape picked — an empty rail is 256px of pitch given
            away for nothing — and closed again once neither is left. Folded, it
            still shows the tools, so drawing is never a hunt. */}
        {!present && (
        <aside
          data-tour="draw"
          style={{ width: railOpen ? layout.right : 36 }}
          className="flex shrink-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-800 transition-[width]"
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

          {/* Opens the rail itself: with a tool already armed, arming another is no change
              in whether anything is being drawn, which is all that opens it otherwise. */}
          {!railOpen && (
            <DrawToolStrip
              tool={activeTool}
              onToolChange={(next) => {
                setTool(next);
                setRailOpen(true);
              }}
            />
          )}

          {railOpen && (
            <div className="border-t border-ink-700">
              <div className="border-b border-ink-700 p-4">
                <DrawPanel
                  doc={doc}
                  onDocChange={setDoc}
                  tool={activeTool}
                  canPan={zoomed}
                  onToolChange={setTool}
                  sticky={sticky}
                  onStickyChange={setSticky}
                  color={drawColor}
                  onColorChange={setDrawColor}
                  dash={drawDash}
                  onDashChange={setDrawDash}
                  filled={drawFilled}
                  onFilledChange={setDrawFilled}
                  sides={drawSides}
                  onSidesChange={setDrawSides}
                  selected={annotation}
                  onDuplicate={onDuplicateAnnotation}
                  onDelete={deleteShape}
                  focusText={focusText}
                  sceneIndex={activeScene}
                />
              </div>
              <Section
                title={t("section.drawn")}
                icon={<Shapes size={13} />}
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
  note,
  playing,
  onPlay,
}: {
  board: string;
  scene: string;
  /** The scene's coaching note, under its name, for the room to read. */
  note: string;
  playing: boolean;
  onPlay: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {(board.trim() || scene.trim() || note.trim()) && (
        <div className="pointer-events-none absolute left-5 top-5 z-10 flex max-w-[60%] flex-col gap-1 rounded-lg bg-black/55 px-4 py-3 backdrop-blur-sm">
          {board.trim() && (
            <span className="truncate text-xl font-bold tracking-tight text-white">{board}</span>
          )}
          {scene.trim() && <span className="truncate text-sm text-white/80">{scene}</span>}
          {note.trim() && (
            <p className="mt-1 max-w-md whitespace-pre-line border-t border-white/15 pt-2 text-sm leading-relaxed text-white/90">
              {note.trim()}
            </p>
          )}
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
  speed,
  onSpeedChange,
  scene,
  time,
  total,
  playing,
  onPlayingChange,
  onTimeChange,
  onExit,
}: {
  speed: number;
  onSpeedChange: (speed: number) => void;
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

      <SpeedButton speed={speed} onChange={onSpeedChange} />

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


/**
 * The edge of a sidebar, dragged to resize it. The width is the reader's and is
 * remembered in this browser; the board takes whatever is left.
 */
function SidebarHandle({
  side,
  width,
  onChange,
}: {
  side: "left" | "right";
  width: number;
  onChange: (width: number) => void;
}) {
  const { t } = useI18n();
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("layout.resize")}
      title={t("layout.resize")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        onChange(clampSidebar(start.current.width + (side === "left" ? dx : -dx)));
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={() => onChange(clampSidebar(256))}
      // A strip between the sidebar and the board, overlapping both by a few pixels
      // so it is easy to catch without taking any width of its own.
      className="relative z-20 -mx-1 w-2 shrink-0 cursor-col-resize transition hover:bg-accent/40"
      data-side={side}
    />
  );
}

/**
 * A top-bar button that opens a menu under itself. Its own mousedown is kept from the open
 * menu's click-away, so a second press closes the menu rather than closing and reopening it.
 */
function MenuButton({
  icon,
  label,
  hint,
  open,
  onOpen,
  tour,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  open: boolean;
  onOpen: (at: { x: number; y: number }) => void;
  /** What the tour calls it, where the tour points at it. */
  tour?: string;
}) {
  return (
    <button
      type="button"
      data-tour={tour}
      aria-haspopup="menu"
      aria-expanded={open}
      title={hint}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onOpen({ x: r.left, y: r.bottom + 4 });
      }}
      className={cn(BAR_BUTTON, open && BAR_BUTTON_OPEN)}
    >
      {icon}
      {label}
      <ChevronDown size={12} aria-hidden className={cn("text-ink-400 transition-transform", open && "rotate-180")} />
    </button>
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
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-300 transition enabled:hover:bg-white/[0.07] enabled:hover:text-white disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** Labels no one reads: a preview is too small for names. */
const PREVIEW_LABELS = { board: "", scene: () => "" };

/**
 * A template's board, small, in the menu that offers it: the second scene, where the
 * first runs are drawn, so the move reads as a move and not as two formations.
 */
const TemplatePreview = memo(function TemplatePreview({ id, view }: { id: TemplateId; view: PitchView }) {
  const doc = useMemo(() => buildTemplate(id, PREVIEW_LABELS), [id]);
  return <SceneThumb doc={doc} index={Math.min(1, doc.scenes.length - 1)} view={view} width={64} height={40} />;
});

/**
 * Where to start, on a board nobody has touched: a card hanging from Help, since Help is
 * where the tour and the keys are found again. Not a dialog — nothing waits on it, and the
 * board stays live under it. Gone as soon as the board changes, and for good once put away.
 */
function StartHint({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="note"
      className="absolute left-1/2 top-full z-40 mt-2.5 w-80 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-[11px] leading-relaxed text-ink-200 shadow-xl"
    >
      <span
        aria-hidden
        className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-l border-t border-ink-600 bg-ink-800"
      />
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-white">{t("hint.start.title")}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("hint.start.dismiss")}
          title={t("hint.start.dismiss")}
          className="ml-auto flex size-5 items-center justify-center rounded text-ink-400 transition hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
      <p>{t("hint.start.move")}</p>
      <p className="mt-1 text-ink-300">{t("hint.start.links")}</p>
      <p className="mt-1 text-ink-300">{t("hint.start.help")}</p>
    </div>
  );
}
