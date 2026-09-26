/**
 * Canvas host: owns sizing, DPR and pointer input, and calls drawBoard.
 *
 * It deliberately holds no board logic. Hit-testing and edits live in
 * src/board/interaction.ts so the renderer and the engine stay usable from the
 * export worker, where none of this exists.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Annotation, BoardDoc, PitchView, Tool, TurfCache, Vec2 } from "@/board/types";
import type { Change } from "@/lib/history";
import { BALL_ID, DEFAULT_PITCH_VIEW, DEFAULT_TOOL, isDrawTool } from "@/board/types";
import { fitViewport, toPitch } from "@/board/geometry";
import { cameraFor, framingOf, unprojectPitch } from "@/board/projection";
import { drawBoard } from "@/board/render";
import { ballRadius } from "@/board/pitch";
import { frameAt, runsThrough } from "@/board/timeline";
import {
  applySelection,
  dragHandle,
  entitiesInRect,
  hitTest,
  hitTestAnnotation,
  hitTestAnnotationHandle,
  hitTestGroundAnnotation,
  hitTestHandle,
  hitTestLink,
  hitTestTilted,
  hitTestTiltedText,
  hitTestTiltedTextHandle,
  moveEntities,
  snapLabel,
  snapPoint,
  swapPlayers,
  swapTarget,
  type Guide,
  tiltedTextPoint,
  type AnnotationHandleHit,
  type Carry,
  type HandleHit,
} from "@/board/interaction";
import {
  MIN_DRAG,
  POLYGON_SIDES,
  addAnnotation,
  draftAnnotation,
  dragAnnotationHandle,
  insertCorner,
  regularPolygon,
  removeCorner,
  boundsOf,
  moveAnnotation,
  simplify,
  updateAnnotation,
} from "@/board/annotations";
import { setPath, setSceneCamera } from "@/board/scenes";
import {
  NO_SCREEN_ZOOM,
  cameraFromZoom,
  cameraTransform,
  screenMapping,
  unzoomPoint,
  type ScreenZoom,
} from "@/board/camera";
import { useI18n } from "@/i18n/context";
import { Stepper } from "@/components/ui/Stepper";

type Props = {
  doc: BoardDoc;
  t: number;
  sceneIndex: number;
  /** Scene whose incoming runs are editable; undefined on scene 0. */
  editScene?: number;
  /** Scenes outlined faintly behind the board, for reference while placing. */
  ghosts?: readonly number[];
  /** How far a move reaches forward through the scenes. Alt overrides it. */
  carry?: Carry;
  pitchView?: PitchView;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  onDocChange: Change<BoardDoc>;
  /** A double-click on a player asks to rename it. The ball has no name. */
  onEditName?: (playerId: string) => void;
  /** What a drag on empty grass does. "select" is marquee; anything else draws. */
  tool?: Tool;
  onToolChange?: (tool: Tool) => void;
  /** Colour and dash a newly drawn shape takes. */
  drawColor?: string;
  drawDash?: "solid" | "dashed" | "wavy";
  /** Whether a newly drawn box or oval is filled, or an outline alone. */
  drawFilled?: boolean;
  /** Corners of a newly drawn polygon. */
  drawSides?: number;
  /** Keep the tool armed after a shape is drawn, for drawing several in a row. */
  sticky?: boolean;
  annotationSelection?: string | null;
  onAnnotationSelect?: (id: string | null) => void;
  /** A connector was clicked on the board, selecting its members — the link, to edit. */
  onLinkPick?: (id: string) => void;
  /**
   * False for read-only playback: no pointer handling and no editor chrome.
   * The renderer already draws that distinction — this is the same flag the
   * exporter passes, so a shared board looks exactly like an exported frame.
   */
  interactive?: boolean;
  /** Players whose whole path through every scene is drawn faintly. */
  trail?: readonly string[];
  /**
   * Look through the scenes' own cameras. On for playback, Present and a shared
   * board; while editing, the view is the working zoom, which a scene's locked zoom
   * sets as it is selected.
   */
  sceneCamera?: boolean;
  /** The board is playing: nothing on it can be pressed, dragged or right-clicked. */
  playing?: boolean;
  /**
   * A press on a paused board that is between scenes, or on another scene than the
   * selected one: the scene being shown, for the editor to settle on, so the edit
   * lands on what the coach sees.
   */
  onEditStart?: (sceneIndex: number) => void;
  /**
   * A right-click: what was under the pointer, and where on the page, for the
   * editor to open its menu at. The selection is already set to the target.
   */
  onContextMenu?: (target: ContextTarget, at: { x: number; y: number }) => void;
};

/** What a right-click landed on. */
export type ContextTarget =
  | { kind: "entity"; id: string }
  | { kind: "shape"; id: string }
  | { kind: "board" };

/** How far the board is zoomed in, and panned, in CSS pixels. Presentation only. */
type Zoom = { z: number; x: number; y: number };
const NO_ZOOM: Zoom = { z: 1, x: 0, y: 0 };
const MAX_ZOOM = 6;

type Drag =
  /**
   * `grab` is the player the drag took hold of, with where the pointer and he
   * started — the reference a snap is measured against. Absent for the ball.
   */
  | {
      kind: "move";
      last: Vec2;
      carry: Carry;
      grab?: { id: string; origin: Vec2; start: Vec2; moving?: boolean };
    }
  /** Panning a zoomed board: where the pointer started, and the pan it started from. */
  | { kind: "pan"; origin: Vec2; from: ScreenZoom }
  | { kind: "handle"; hit: HandleHit }
  | { kind: "marquee"; a: Vec2; b: Vec2; additive: boolean }
  /** Dragging a new shape out. `start` is the anchor; `ann` is the live preview. */
  | { kind: "draw"; start: Vec2; points: Vec2[]; ann: Annotation }
  /** `startAt` is a label's anchor when grabbed: its drag is measured from there, so a snap is exact. */
  | { kind: "ann-move"; id: string; last: Vec2; origin: Vec2; startAt: Vec2 | null }
  /** `billboard` when the handle belongs to a label under the camera (D91). */
  | { kind: "ann-handle"; hit: AnnotationHandleHit; billboard: boolean }
  | null;

export function BoardCanvas({
  doc,
  t,
  sceneIndex,
  editScene,
  ghosts,
  carry = "stationary",
  pitchView = DEFAULT_PITCH_VIEW,
  selection,
  onSelectionChange,
  onDocChange,
  onEditName,
  tool = DEFAULT_TOOL,
  onToolChange,
  drawColor = "#fbbf24",
  drawDash = "solid",
  drawFilled = true,
  drawSides = POLYGON_SIDES,
  sticky = false,
  annotationSelection = null,
  onAnnotationSelect,
  onLinkPick,
  interactive = true,
  trail,
  onContextMenu,
  sceneCamera = false,
  playing = false,
  onEditStart,
}: Props) {
  /**
   * One gate (D91). Everything the flat board can do, the angled view can too.
   *
   * Every point the pointer hands over is a place on the pitch — unprojected under
   * the camera — so a token follows the cursor, a shape's corner lands under it, and
   * what was drawn in 3D is ordinary pitch geometry on the flat board. The one thing
   * the view changes is the gesture: a metre up-pitch is fewer pixels than a metre
   * across, so a circle scribbled under the camera is an oval once laid flat.
   */
  const live = interactive;
  const tilted = !!framingOf(pitchView).tilt;

  /**
   * True where the pointer has ground under it.
   *
   * Above the horizon `unprojectPitch` answers NaN, because there is no place on the
   * pitch up there. A NaN reaching a delta puts NaN into a position, and the board
   * is gone — so it is checked once, here, rather than in each of the six things
   * that consume a point.
   */
  const onGrass = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);

  /**
   * Framing the pointer is working in.
   *
   * Labels stay upright while the board turns, so their box, their width handle
   * and the drag that sets it all run along pitch y on a vertical board. Every
   * hit test that can land on a label has to be told which way it is standing.
   */
  const rotated = framingOf(pitchView).rotated;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<HTMLCanvasElement>(null);
  const wasTilted = useRef(tilted);

  /**
   * Cross-fade between the flat board and the angled one.
   *
   * A layout effect, so it runs after the toggle has committed but before the draw
   * effect below repaints the canvas: the last frame of the old view is copied onto
   * a canvas over the top, which then fades out over the new one. Presentation
   * only — nothing here reaches `drawBoard`, and an export never sees it.
   */
  useLayoutEffect(() => {
    if (wasTilted.current === tilted) return;
    wasTilted.current = tilted;
    const from = canvasRef.current;
    const fade = fadeRef.current;
    const ctx = fade?.getContext("2d");
    if (!from || !fade || !ctx || from.width === 0 || from.height === 0) return;

    fade.width = from.width;
    fade.height = from.height;
    ctx.drawImage(from, 0, 0);
    fade.style.transition = "none";
    fade.style.opacity = "1";
    // Reading layout commits the full-strength copy before the fade starts. Not a
    // requestAnimationFrame: those do not fire in a background tab, and the old view
    // would sit over the new one until the tab came back.
    void fade.offsetWidth;
    fade.style.transition = `opacity ${TILT_FADE_MS}ms ease-out`;
    fade.style.opacity = "0";
  }, [tilted]);
  const turf = useRef<TurfCache>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  /** The lines a drag has snapped to, while it lasts. */
  const [guides, setGuides] = useState<Guide[]>([]);
  /** The box a dragged drawing covers, for the ruler along the pitch's edges. */
  const [ruler, setRuler] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** The player a dragged one would swap with if dropped now. */
  const [swapWith, setSwapWith] = useState<string | null>(null);
  const i18n = useI18n();
  // The view is ALWAYS the scenes' cameras: a zoom belongs to the scene it was set
  // on, and changing it while a scene is selected changes that scene's. There is no
  // working zoom beside it — one was how a zoom set on one scene leaked into every
  // scene that had none. During playback and Present the cameras drive the view and
  // the zoom cannot be changed.
  const throughCamera = sceneCamera || live;
  const cameraLocked = sceneCamera;
  const scene = doc.scenes[sceneIndex];
  const viewZoom = NO_ZOOM;

  const mappingFor = (width: number, height: number) =>
    screenMapping(doc, pitchView, width, height, window.devicePixelRatio || 1);

  /**
   * Set the view — which is to say, this scene's camera. At 100% the scene has none
   * and shows the whole board. One undo step per scene however many wheel ticks,
   * presses or drags it took.
   */
  const writeZoom = (next: ScreenZoom) => {
    if (cameraLocked || !scene || size.w === 0 || size.h === 0) return;
    const clamped = clampZoom(next, size);
    const camera =
      clamped.z <= 1.001 ? null : cameraFromZoom(clamped, size.w, size.h, mappingFor(size.w, size.h));
    if (clamped.z > 1.001 && !camera) return;
    onDocChange(setSceneCamera(doc, sceneIndex, camera), `camera:${scene.id}`);
  };

  /**
   * The scene camera's screen transform at this instant, for turning the pointer
   * back into a place on the pitch — the same function the renderer draws with.
   */
  const sceneZoom = (width: number, height: number): ScreenZoom => {
    if (!throughCamera) return NO_SCREEN_ZOOM;
    const mapping = screenMapping(doc, pitchView, width, height, window.devicePixelRatio || 1);
    return cameraTransform(frameAt(doc, t).resolved, doc, width, height, mapping);
  };
  /** The view as drawn right now — the scene's camera, or its move between two. */
  const shownView = sceneZoom(size.w, size.h);
  /** Where the pointer is while hovering, in CSS pixels — where the hover card sits. */
  const [hoverAt, setHoverAt] = useState<Vec2 | null>(null);
  /**
   * What the pointer is over, when it is over a control point.
   *
   * Separate from `hover`, which is the entity under the pointer and feeds the
   * renderer. This one only picks the cursor — a handle is drawn on top of
   * whatever it edits, so it wins the cursor without stealing the highlight.
   */
  const [grip, setGrip] = useState<"grab" | "resize" | null>(null);
  const [drag, setDrag] = useState<Drag>(null);

  // Track the element's CSS size; the viewport is derived from it, never stored.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // DPR lives here and only here — never in Viewport.scale.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    // The zoom is one more screen-space transform on top of the DPR, so the whole
    // board — flat or under the camera — scales about the same origin and stays
    // crisp: the canvas is redrawn at the new scale, never stretched.
    ctx.setTransform(dpr * viewZoom.z, 0, 0, dpr * viewZoom.z, dpr * viewZoom.x, dpr * viewZoom.y);

    const framing = framingOf(pitchView);
    const view = fitViewport(size.w, size.h, doc.pitch.length, doc.pitch.width, framing);
    drawBoard(ctx, doc, t, {
      ...view,
      width: size.w,
      height: size.h,
      interactive: live,
      turf: turf.current,
      tilt: framing.tilt,
      selection,
      hover: swapWith ?? hover,
      editScene,
      ghosts,
      guides,
      ruler,
      trail,
      sceneCamera: throughCamera,
      marquee: drag?.kind === "marquee" ? { a: drag.a, b: drag.b } : null,
      annotationSelection,
      draft: drag?.kind === "draw" ? drag.ann : null,
    });
  }, [
    doc,
    t,
    size,
    selection,
    hover,
    drag,
    editScene,
    ghosts,
    pitchView,
    annotationSelection,
    live,
    viewZoom,
    guides,
    ruler,
    swapWith,
    trail,
    throughCamera,
  ]);

  /** Where the pointer is on the canvas, in CSS pixels. What a billboard is tested with. */
  const screenFrom = (e: React.MouseEvent<HTMLCanvasElement>): Vec2 => {
    const rect = e.currentTarget.getBoundingClientRect();
    const at = unzoom({ x: e.clientX - rect.left, y: e.clientY - rect.top }, viewZoom);
    return unzoomPoint(at, sceneZoom(rect.width, rect.height));
  };

  /** Where the pointer is on the canvas element itself, zoom or no zoom. */
  const rawFrom = (e: React.MouseEvent<HTMLCanvasElement>): Vec2 => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /**
   * The camera the pointer is looking through — the same one the renderer builds,
   * from the same helper, so a hit test cannot drift from what was drawn.
   */
  const cameraFrom = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return cameraFor(
      doc.pitch,
      pitchView.half,
      rect.width,
      rect.height,
      window.devicePixelRatio || 1,
    );
  };

  /**
   * The place on the GRASS under the pointer.
   *
   * Tilted, that is the camera run backwards; flat, it is the plain viewport. Every
   * test below that works in pitch metres — connectors, zones, the marquee — takes
   * this and needs to know nothing else about the view.
   */
  const pointFrom = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Vec2 => {
      const rect = e.currentTarget.getBoundingClientRect();
      const at = unzoomPoint(
        unzoom({ x: e.clientX - rect.left, y: e.clientY - rect.top }, viewZoom),
        sceneZoom(rect.width, rect.height),
      );
      if (framingOf(pitchView).tilt) {
        const cam = cameraFor(
          doc.pitch,
          pitchView.half,
          rect.width,
          rect.height,
          window.devicePixelRatio || 1,
        );
        return unprojectPitch(at, cam);
      }
      const view = fitViewport(rect.width, rect.height, doc.pitch.length, doc.pitch.width, pitchView);
      return toPitch(at, view);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneZoom reads doc and t, listed
    [doc, t, pitchView, viewZoom, throughCamera],
  );

  /** Scene the annotations are keyed to — the one being played into. */
  const annotationScene = () => frameAt(doc, t).resolved.index;

  /** Taking hold of a drawing to move it. A label remembers where it started, to snap from. */
  const annMove = (id: string, p: Vec2): Drag => {
    const ann = (doc.annotations ?? []).find((a) => a.id === id);
    return { kind: "ann-move", id, last: p, origin: p, startAt: ann?.kind === "text" ? ann.at : null };
  };

  /** What a move drag holds on to, for snapping: a player and where he and the pointer began. */
  const grabOf = (id: string, p: Vec2) => {
    if (id === BALL_ID) return undefined;
    const start = doc.scenes[annotationScene()]?.positions[id];
    return start ? { id, origin: p, start: { ...start } } : undefined;
  };

  // The wheel: ⌘/Ctrl or a pinch zooms about the pointer; plain scrolling pans a
  // zoomed board and is left to the page otherwise. A native listener, because
  // React's wheel handler is passive and could not stop the page zooming too.
  // The latest view and writer, for the wheel listener below, which is attached once
  // rather than on every change of the board.
  const zoomNow = useRef({ current: NO_SCREEN_ZOOM, write: writeZoom });
  useEffect(() => {
    zoomNow.current = { current: sceneZoom(size.w, size.h), write: writeZoom };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !live) return;
    const onWheel = (e: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const { current, write } = zoomNow.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        write(zoomAbout(current, at, Math.exp(-e.deltaY * 0.0025), size));
        return;
      }
      if (current.z <= 1) return;
      e.preventDefault();
      write({ ...current, x: current.x - e.deltaX, y: current.y - e.deltaY });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [live, size]);

  /**
   * A right-click: select what is under the pointer as a click would, then hand
   * the editor the target and the page position for its menu.
   */
  const onContext = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onContextMenu) return;
    e.preventDefault();
    if (playing) return;
    const p = pointFrom(e);
    const frame = frameAt(doc, t);
    const scene = frame.resolved.index;
    const page = { x: e.clientX, y: e.clientY };

    const shape = tilted
      ? (hitTestTiltedText(doc, scene, screenFrom(e), cameraFrom(e)) ??
        (onGrass(p) ? LAYERS.map((l) => hitTestGroundAnnotation(doc, scene, p, l)).find(Boolean) : null))
      : (hitTestAnnotation(doc, scene, p, "mark", rotated) ?? null);
    const entity = tilted
      ? hitTestTilted(doc, frame, screenFrom(e), cameraFrom(e))
      : hitTest(doc, frame, p);
    const zone = !tilted ? hitTestAnnotation(doc, scene, p, "zone", rotated) : null;

    // Same order as a click: marks over players, players over zones.
    if (shape && (!entity || !tilted)) {
      onAnnotationSelect?.(shape.id);
      onSelectionChange(new Set());
      onContextMenu({ kind: "shape", id: shape.id }, page);
      return;
    }
    if (entity) {
      onAnnotationSelect?.(null);
      if (!selection.has(entity.id)) onSelectionChange(new Set([entity.id]));
      onContextMenu({ kind: "entity", id: entity.id }, page);
      return;
    }
    if (zone) {
      onAnnotationSelect?.(zone.id);
      onSelectionChange(new Set());
      onContextMenu({ kind: "shape", id: zone.id }, page);
      return;
    }
    onContextMenu({ kind: "board" }, page);
  };

  /**
   * The board from the keyboard: Tab and Shift+Tab step through the players, Enter
   * renames the one selected. Past the last player Tab lets focus go on, so the
   * board is never a trap.
   */
  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "Enter" && selection.size === 1) {
      const [only] = selection;
      if (only !== BALL_ID) {
        e.preventDefault();
        onEditName?.(only);
      }
      return;
    }
    if (e.key !== "Tab") return;
    const order = doc.teams.filter((team) => !team.hidden).flatMap((team) => team.players.map((p) => p.id));
    if (order.length === 0) return;
    const current = selection.size === 1 ? order.indexOf([...selection][0]) : -1;
    const next = current === -1 ? (e.shiftKey ? order.length - 1 : 0) : current + (e.shiftKey ? -1 : 1);
    if (next < 0 || next >= order.length) return;
    e.preventDefault();
    onAnnotationSelect?.(null);
    onSelectionChange(new Set([order[next]]));
  };

  /**
   * The selected shape's grab point under the pointer, and which space it lives in.
   *
   * A shape's handles are pitch geometry, drawn into the ground layer and warped
   * with it — so under the camera they are grabbed at the unprojected point like
   * anything else on the grass. A LABEL's are drawn inside its billboard, around the
   * words, and are tested there. Only its width handle: its move handle sits in the
   * middle of the words, and the words already move it by the grass (D50, D91).
   */
  const shapeHandleAt = (
    e: React.MouseEvent<HTMLCanvasElement>,
    p: Vec2,
  ): { hit: AnnotationHandleHit; billboard: boolean } | null => {
    const scene = annotationScene();
    const selected = annotationSelection
      ? (doc.annotations ?? []).find((a) => a.id === annotationSelection)
      : undefined;
    if (tilted && selected?.kind === "text") {
      const hit = hitTestTiltedTextHandle(
        doc,
        scene,
        annotationSelection,
        screenFrom(e),
        cameraFrom(e),
      );
      return hit?.which === "w" ? { hit, billboard: true } : null;
    }
    const hit = hitTestAnnotationHandle(doc, scene, annotationSelection, p, rotated);
    return hit ? { hit, billboard: false } : null;
  };

  /**
   * Undo key for the drag in progress.
   *
   * A drag writes a document per pointermove; tagging them all with one key
   * collapses the whole gesture into a single undo step. Bumped on every
   * pointerdown so the next drag is a step of its own.
   */
  const gesture = useRef(0);
  const dragKey = () => `drag-${gesture.current}`;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (playing) return;
    gesture.current += 1;
    const p = pointFrom(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    // The hover card is about what the pointer rests on; a press is the end of that.
    setHoverAt(null);

    // Between two scenes nothing drawn is anywhere an edit could land, and settling
    // on the scene moves the whole board under the pointer: this press only settles,
    // and the next one edits. A still frame of another scene settles and carries on.
    const showing = frameAt(doc, t).resolved;
    if (e.button !== 2 && (showing.moving || showing.index !== sceneIndex)) {
      onEditStart?.(showing.index);
      if (showing.moving) return;
    }

    // The middle button pans a zoomed board, and does nothing else. Not Space-drag,
    // the usual convention: Space already plays and pauses.
    const shown = sceneZoom(size.w, size.h);
    if (e.button === 1 && shown.z > 1) {
      e.preventDefault();
      setDrag({ kind: "pan", origin: rawFrom(e), from: shown });
      return;
    }
    // The right button belongs to the context menu.
    if (e.button === 2) return;

    // A drawing tool takes the whole gesture: no selecting, no marquee.
    if (isDrawTool(tool)) {
      startDrawing(p);
      return;
    }

    // The selected shape's own handles come first, above even run handles: they are
    // drawn on top of everything and are the most deliberate target there is.
    const annHandle = shapeHandleAt(e, p);
    if (annHandle) {
      const { hit } = annHandle;
      const ann = (doc.annotations ?? []).find((a) => a.id === hit.id);
      // Alt on a corner takes it out; the shape refuses where it would have too few.
      if (ann && hit.which === "v" && e.altKey) {
        const patch = removeCorner(ann, hit.index ?? 0);
        if (patch) onDocChange(updateAnnotation(doc, ann.id, patch));
        return;
      }
      // Taking hold of an edge's middle puts a corner there and drags it, as one
      // undo step with the drag.
      if (ann && hit.which === "m") {
        const made = insertCorner(ann, hit.index ?? 0, p);
        if (!made) return;
        onDocChange(updateAnnotation(doc, ann.id, made.patch), dragKey());
        setDrag({
          kind: "ann-handle",
          hit: { id: ann.id, which: "v", index: made.index },
          billboard: false,
        });
        return;
      }
      setDrag({ kind: "ann-handle", ...annHandle });
      return;
    }

    // Control handles win over tokens: they can overlap one, and they are the
    // smaller, more deliberate target. They lie ON the grass and are drawn into the
    // ground layer, so the unprojected pitch point is exactly right in 3D too.
    if (editScene !== undefined && onGrass(p)) {
      const handle = hitTestHandle(doc, editScene, selection, p);
      if (handle) {
        setDrag({ kind: "handle", hit: handle });
        return;
      }
    }

    const frame = frameAt(doc, t);
    const scene = frame.resolved.index;

    if (tilted) {
      const cam = cameraFrom(e);
      const screen = screenFrom(e);

      // Draw order, read backwards — and it is not the flat one. A label stands up
      // off the grass and is drawn last of all, so it takes a click first; the
      // other marks lie IN the ground layer, under the players, and are tested
      // after them rather than before.
      const label = hitTestTiltedText(doc, scene, screen, cam);
      if (label) {
        selectAnnotation(label.id);
        // The anchor moves by the same ground delta the cursor's own place on the
        // grass moves by, so the words track the pointer. What it cannot do is keep
        // the grab point pinned exactly: the offset is held in metres, and a metre
        // is worth more pixels as the label comes toward the camera (D50).
        if (onGrass(p)) setDrag(annMove(label.id, p));
        return;
      }

      const standing = hitTestTilted(doc, frame, screen, cam);
      if (standing) {
        onAnnotationSelect?.(null);
        // Dragging one of several selected entities moves the whole unit; grabbing
        // an unselected one selects it first. Same rule as the flat board.
        if (!selection.has(standing.id)) {
          onSelectionChange(applySelection(selection, standing, e.shiftKey));
        }
        // A token is drawn where it stands, so the delta between two unprojected
        // points moves it exactly under the cursor (D49).
        if (onGrass(p)) {
          setDrag({
            kind: "move",
            last: p,
            carry: e.altKey ? "scene" : carry,
            grab: grabOf(standing.id, p),
          });
        }
        return;
      }

      for (const layer of ["mark", "zone"] as const) {
        const ann = hitTestGroundAnnotation(doc, scene, p, layer);
        if (ann) {
          selectAnnotation(ann.id);
          if (onGrass(p)) setDrag(annMove(ann.id, p));
          return;
        }
      }

      const unit = hitTestLink(doc, frame.resolved, p);
      if (unit) {
        onAnnotationSelect?.(null);
        onSelectionChange(new Set(e.shiftKey ? [...selection, ...unit.members] : unit.members));
        onLinkPick?.(unit.id);
        return;
      }

      onAnnotationSelect?.(null);
      if (!e.shiftKey) onSelectionChange(new Set());
      // In pitch metres, like the flat one: the corners were turned back into
      // places on the grass, so the sweep is an area of pitch and warps with it.
      if (pans) startPan(e);
      else if (onGrass(p)) setDrag({ kind: "marquee", a: p, b: p, additive: e.shiftKey });
      return;
    }

    // Marks are drawn above the tokens, so they take a click from one. Zones are
    // drawn below and are tested after. Hit-testing mirrors the draw order.
    const mark = hitTestAnnotation(doc, scene, p, "mark", rotated);
    if (mark) {
      selectAnnotation(mark.id);
      setDrag(annMove(mark.id, p));
      return;
    }

    const hit = hitTest(doc, frame, p);
    if (hit) {
      onAnnotationSelect?.(null);
      // Dragging one of several selected entities moves the whole unit; grabbing
      // an unselected one selects it first.
      if (!selection.has(hit.id)) {
        onSelectionChange(applySelection(selection, hit, e.shiftKey));
      }
      // Decided once, at the grab. Reading the modifier per pointermove would
      // let the carry stop mid-gesture, stranding the scenes it had already
      // taken along at wherever the cursor happened to be.
      setDrag({ kind: "move", last: p, carry: e.altKey ? "scene" : carry, grab: grabOf(hit.id, p) });
      return;
    }

    const zone = hitTestAnnotation(doc, scene, p, "zone", rotated);
    if (zone) {
      selectAnnotation(zone.id);
      setDrag(annMove(zone.id, p));
      return;
    }

    // A connector runs under its players, so it is only reachable on empty grass.
    const link = hitTestLink(doc, frame.resolved, p);
    if (link) {
      onAnnotationSelect?.(null);
      onSelectionChange(new Set(e.shiftKey ? [...selection, ...link.members] : link.members));
      onLinkPick?.(link.id);
      return;
    }

    onAnnotationSelect?.(null);
    if (!e.shiftKey) onSelectionChange(new Set());
    // Empty grass: the Pan tool moves a zoomed view, and otherwise sweeps a box.
    if (pans) startPan(e);
    else setDrag({ kind: "marquee", a: p, b: p, additive: e.shiftKey });
  };

  /**
   * Whether a drag on empty grass moves the view. Only once zoomed in: at 100%
   * there is nowhere to go, so the Pan tool sweeps a selection box as Select does.
   */
  const pans = tool === "pan" && shownView.z > 1 && !cameraLocked;

  const startPan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDrag({ kind: "pan", origin: rawFrom(e), from: shownView });
  };

  /**
   * Whether a drawn shape is under the pointer, for the cursor alone.
   *
   * Tested in the space each is drawn in, as a click is: under the camera a label
   * or a drawn ball stands up off the grass and everything else lies in it. Which
   * one is on top does not matter here — any of them is grabbed the same way.
   */
  const shapeUnder = (e: React.MouseEvent<HTMLCanvasElement>, p: Vec2): boolean => {
    const scene = annotationScene();
    if (tilted) {
      if (hitTestTiltedText(doc, scene, screenFrom(e), cameraFrom(e))) return true;
      if (!onGrass(p)) return false;
      return LAYERS.some((layer) => hitTestGroundAnnotation(doc, scene, p, layer));
    }
    return LAYERS.some((layer) => hitTestAnnotation(doc, scene, p, layer, rotated));
  };

  /** Selecting a shape drops the entity selection: separate things, separate panels. */
  const selectAnnotation = (id: string) => {
    onAnnotationSelect?.(id);
    if (selection.size > 0) onSelectionChange(new Set());
  };

  /**
   * Begin a shape.
   *
   * Text is a click rather than a drag — there is nothing to size — so it commits
   * immediately and hands the panel the cursor for its content. So is a ball, and
   * it stays armed when the tool is pinned: a drill is usually several of them.
   */
  const startDrawing = (p: Vec2) => {
    if (!isDrawTool(tool) || !onGrass(p)) return;
    const sceneId = doc.scenes[annotationScene()]?.id ?? doc.scenes[0].id;
    const ann = draftAnnotation(doc, tool, sceneId, p, p, {
      color: drawColor,
      dash: drawDash,
      filled: drawFilled,
      sides: drawSides,
      points: [p],
    });

    if (tool === "text") {
      onDocChange(addAnnotation(doc, ann));
      onAnnotationSelect?.(ann.id);
      onToolChange?.(DEFAULT_TOOL);
      return;
    }
    if (tool === "ball") {
      onDocChange(addAnnotation(doc, ann));
      onAnnotationSelect?.(ann.id);
      if (!sticky) onToolChange?.(DEFAULT_TOOL);
      return;
    }
    setDrag({ kind: "draw", start: p, points: [p], ann });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFrom(e);

    // Dragged up past the horizon there is no ground to read, so the gesture holds
    // where it was rather than putting NaN into a position. Releasing up there is
    // handled the same way, in onPointerUp. A label's width is read off its
    // billboard, not the grass, and needs no ground.
    if (drag?.kind === "pan") {
      const now = rawFrom(e);
      writeZoom({
        ...drag.from,
        x: drag.from.x + now.x - drag.origin.x,
        y: drag.from.y + now.y - drag.origin.y,
      });
      return;
    }

    const onBillboard = drag?.kind === "ann-handle" && drag.billboard;
    if (drag && !onBillboard && !onGrass(p)) return;

    if (!drag) {
      if (isDrawTool(tool)) {
        setHover(null);
        setGrip(null);
        return;
      }
      // Same order as pointerdown: the shape's own handles, then run handles,
      // then the tokens. The cursor has to promise what the click will do.
      const annHandle = shapeHandleAt(e, p);
      const onHandle =
        annHandle ??
        (editScene === undefined || !onGrass(p)
          ? null
          : hitTestHandle(doc, editScene, selection, p));
      setGrip(
        annHandle?.hit.which === "w"
          ? "resize"
          : onHandle || shapeUnder(e, p)
            ? "grab"
            : null,
      );
      setHover(
        (tilted
          ? hitTestTilted(doc, frameAt(doc, t), screenFrom(e), cameraFrom(e))
          : hitTest(doc, frameAt(doc, t), p)
        )?.id ?? null,
      );
      setHoverAt(rawFrom(e));
      return;
    }

    if (drag.kind === "handle") {
      if (editScene === undefined) return;
      const curve = dragHandle(doc, editScene, drag.hit, p);
      if (curve) onDocChange(setPath(doc, editScene, drag.hit.id, curve), dragKey());
      return;
    }

    if (drag.kind === "move") {
      // Measured from where the drag started rather than from the last move, so a
      // snap is exact and letting go of one does not leave the player behind the
      // pointer. The player taken hold of is drawn onto the lines of the others —
      // level across the pitch, or in the same channel — unless ⌘/Ctrl is held.
      if (drag.grab) {
        const scene = doc.scenes[sceneIndex];
        const now = scene?.positions[drag.grab.id];
        if (!now) return;
        // A click is not a drag. Until the pointer has actually travelled, nothing
        // moves — otherwise the first stray pointermove of a click would snap the
        // player onto a neighbour's line.
        if (!drag.grab.moving) {
          const travelled = Math.hypot(p.x - drag.grab.origin.x, p.y - drag.grab.origin.y);
          if (travelled < DRAG_START_M) return;
          setDrag({ ...drag, grab: { ...drag.grab, moving: true } });
        }
        const wanted = {
          x: drag.grab.start.x + p.x - drag.grab.origin.x,
          y: drag.grab.start.y + p.y - drag.grab.origin.y,
        };
        const others = Object.entries(scene.positions)
          .filter(([id]) => !selection.has(id))
          .map(([, at]) => at);
        const snapped = e.metaKey || e.ctrlKey ? { point: wanted, guides: [] } : snapPoint(wanted, others);
        const delta = { x: snapped.point.x - now.x, y: snapped.point.y - now.y };
        setGuides(snapped.guides);
        // Dropped squarely on another player, a single one swaps places with him.
        setSwapWith(
          selection.size === 1 ? swapTarget(doc, sceneIndex, drag.grab.id, snapped.point) : null,
        );
        if (delta.x !== 0 || delta.y !== 0) {
          onDocChange(moveEntities(doc, sceneIndex, selection, delta, drag.carry), dragKey());
        }
        return;
      }
      const delta = { x: p.x - drag.last.x, y: p.y - drag.last.y };
      if (delta.x !== 0 || delta.y !== 0) {
        onDocChange(moveEntities(doc, sceneIndex, selection, delta, drag.carry), dragKey());
        setDrag({ ...drag, last: p });
      }
      return;
    }

    if (drag.kind === "ann-move") {
      // A label is drawn onto the pitch's lines and the other labels, measured from where it
      // was grabbed, unless ⌘/Ctrl is held — as a player is onto the others. Not under the
      // camera: there a label is a billboard, and its box is nowhere on the grass.
      const label = (doc.annotations ?? []).find((a) => a.id === drag.id);
      if (label?.kind === "text" && drag.startAt && !tilted) {
        const wanted = {
          x: drag.startAt.x + p.x - drag.origin.x,
          y: drag.startAt.y + p.y - drag.origin.y,
        };
        const snapped =
          e.metaKey || e.ctrlKey
            ? { at: wanted, guides: [] }
            : snapLabel(doc, annotationScene(), label, wanted, rotated, pitchView.half);
        setGuides(snapped.guides);
        setRuler(boundsOf({ ...label, at: snapped.at }, rotated));
        if (snapped.at.x !== label.at.x || snapped.at.y !== label.at.y) {
          onDocChange(updateAnnotation(doc, label.id, { at: snapped.at }), dragKey());
        }
        return;
      }
      const delta = { x: p.x - drag.last.x, y: p.y - drag.last.y };
      if (delta.x !== 0 || delta.y !== 0) {
        const next = moveAnnotation(doc, drag.id, delta);
        onDocChange(next, dragKey());
        setDrag({ ...drag, last: p });
        const moved = (next.annotations ?? []).find((a) => a.id === drag.id);
        if (moved && !tilted) setRuler(boundsOf(moved, rotated, ballRadius(doc)));
      }
      return;
    }

    if (drag.kind === "ann-handle") {
      const ann = (doc.annotations ?? []).find((a) => a.id === drag.hit.id);
      if (!ann) return;
      // A billboard's axes are the screen's, so its width runs along screen x
      // however the board is turned underneath.
      const to = drag.billboard
        ? tiltedTextPoint(doc, annotationScene(), ann.id, screenFrom(e), cameraFrom(e))
        : p;
      if (!to) return;
      onDocChange(
        updateAnnotation(
          doc,
          ann.id,
          dragAnnotationHandle(
            ann,
            drag.hit.which,
            to,
            rotated && !drag.billboard,
            drag.hit.index,
          ),
        ),
        dragKey(),
      );
      return;
    }

    if (drag.kind === "draw") {
      setDrag(growDraft(drag, p));
      return;
    }

    setDrag({ ...drag, b: p });
  };

  /**
   * Extend the shape being dragged.
   *
   * A pen collects points, thinned to a minimum spacing — a pointer emits far
   * more events than a line needs, and every one of them would be simplified
   * away again on commit. Everything else just tracks its far corner.
   */
  const growDraft = (drag: Extract<Drag, { kind: "draw" }>, p: Vec2): Drag => {
    if (drag.ann.kind === "pen") {
      const last = drag.points[drag.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.25) return drag;
      const points = [...drag.points, p];
      return { ...drag, points, ann: { ...drag.ann, points } };
    }
    // Text and balls commit on the click that creates them, so never reach a draft.
    if (drag.ann.kind === "text" || drag.ann.kind === "ball") return drag;
    // Laid out afresh in the box dragged so far, with the corner count it started with.
    if (drag.ann.kind === "polygon") {
      const points = regularPolygon(drag.start, p, drag.ann.points.length);
      return { ...drag, ann: { ...drag.ann, points } };
    }
    return { ...drag, ann: { ...drag.ann, a: drag.start, b: p } };
  };

  /**
   * Double-click a player to rename it. Narrows the selection to that one player
   * first: renaming is a single-player edit, and the panel only offers the field
   * when exactly one is selected.
   */
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onEditName || isDrawTool(tool)) return;
    const frame = frameAt(doc, t);
    const hit = tilted
      ? hitTestTilted(doc, frame, screenFrom(e), cameraFrom(e))
      : hitTest(doc, frame, pointFrom(e));
    if (!hit || hit.id === BALL_ID) return;
    onSelectionChange(new Set([hit.id]));
    onEditName(hit.id);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFrom(e);
    // Released above the horizon, where there is no ground: the shape commits from
    // its last good pointermove instead. The marquee needs no such guard — it
    // commits from the corners it stored, which were finite when they were stored.
    const landed = onGrass(p);

    if (drag?.kind === "marquee") {
      const inside = entitiesInRect(doc, frameAt(doc, t), drag.a, drag.b);
      const next = drag.additive ? new Set(selection) : new Set<string>();
      for (const id of inside) next.add(id);
      onSelectionChange(next);
    }

    // Commit from where the pointer actually came up, not from the last state
    // the moves happened to leave behind. A drag fast enough to skip its final
    // pointermove would otherwise commit a zero-size shape and be discarded.
    if (drag?.kind === "draw" && landed) commitDraft(drag, p);

    // Dropped onto a team-mate — or anyone: a swap of places, as one undo step with
    // the drag that led to it.
    if (drag?.kind === "move" && drag.grab && swapWith) {
      onDocChange(
        swapPlayers(doc, sceneIndex, drag.grab.id, swapWith, drag.grab.start, drag.carry),
        dragKey(),
      );
    }

    setGuides([]);
    setRuler(null);
    setSwapWith(null);
    setDrag(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  /**
   * Commit the drawn shape, or discard it.
   *
   * A drag under MIN_DRAG was a click that happened to land on a draw tool, and
   * committing it would litter the board with invisible zero-length shapes.
   */
  const commitDraft = (drag: Extract<Drag, { kind: "draw" }>, end: Vec2) => {
    const final = growDraft(drag, end);
    const grown = final?.kind === "draw" ? final : drag;

    const ann =
      grown.ann.kind === "pen"
        ? { ...grown.ann, points: simplify([...grown.points, end]) }
        : grown.ann;

    if (ann.kind === "text" || ann.kind === "ball") return;

    const drawn =
      ann.kind === "pen" || ann.kind === "polygon"
        ? ann.points.length >= 2 && spread(ann.points) >= MIN_DRAG
        : Math.hypot(ann.b.x - ann.a.x, ann.b.y - ann.a.y) >= MIN_DRAG;

    if (!drawn) return;

    onDocChange(addAnnotation(doc, ann));
    onAnnotationSelect?.(ann.id);
    // Back to select unless the tool is pinned: one accidental extra arrow is
    // more annoying than one extra click.
    if (!sticky) onToolChange?.(DEFAULT_TOOL);
  };

  /**
   * The pointer's job, as a CSS cursor.
   *
   * The width handle resizes along the pitch's x-axis, which is down the screen
   * once the board is stood on end — so the arrows follow the framing rather than
   * the document, or they point across the one direction the drag cannot go.
   * Under the camera a label is a billboard and its width runs along the screen.
   */
  const cursor = (): string => {
    if (!live || playing) return "default";
    if (isDrawTool(tool)) return "crosshair";
    if (drag?.kind === "pan") return "grabbing";
    const resize = rotated && !tilted ? "ns-resize" : "ew-resize";
    if (drag?.kind === "ann-handle") return drag.hit.which === "w" ? resize : "grabbing";
    if (drag?.kind === "move" || drag?.kind === "handle" || drag?.kind === "ann-move") {
      return "grabbing";
    }
    if (grip === "resize") return resize;
    // An open hand over empty grass too, where the Pan tool has somewhere to go.
    return grip === "grab" || hover || pans ? "grab" : "default";
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas
        ref={fadeRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0 }}
      />
      <canvas
        ref={canvasRef}
        tabIndex={live ? 0 : undefined}
        aria-label={i18n.t("board.aria")}
        onKeyDown={live ? onKey : undefined}
        onContextMenu={live ? onContext : undefined}
        className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        style={{ cursor: drag?.kind === "pan" ? "grabbing" : cursor() }}
        onPointerDown={live ? onPointerDown : undefined}
        onPointerMove={live ? onPointerMove : undefined}
        onPointerUp={live ? onPointerUp : undefined}
        onPointerLeave={() => {
          setHover(null);
          setGrip(null);
        }}
        onDoubleClick={live ? onDoubleClick : undefined}
      />
      {/* This scene's zoom, with its arrows. It is saved as it changes, and is what
          playback, Present and exports show for the scene; 100% is the whole board. */}
      {live && (
        <div
          className="absolute bottom-3 right-3 z-10 flex items-center overflow-hidden rounded-md border border-ink-600 bg-ink-800/90 font-mono text-[11px] text-ink-200 shadow"
          title={i18n.t("board.zoom.scene", { scene: scene?.name ?? "" })}
        >
          <ZoomField
            value={shownView.z}
            disabled={cameraLocked || size.w === 0}
            label={i18n.t("board.zoom.field")}
            onCommit={(target) =>
              writeZoom(zoomAbout(shownView, { x: size.w / 2, y: size.h / 2 }, target / shownView.z, size))
            }
          />
          <Stepper
            className="border-l border-ink-600"
            upLabel={i18n.t("board.zoom.in")}
            downLabel={i18n.t("board.zoom.out")}
            upDisabled={shownView.z >= MAX_ZOOM || cameraLocked}
            downDisabled={shownView.z <= 1 || cameraLocked}
            onUp={() => writeZoom(zoomAbout(shownView, { x: size.w / 2, y: size.h / 2 }, 1.25, size))}
            onDown={() => writeZoom(zoomAbout(shownView, { x: size.w / 2, y: size.h / 2 }, 1 / 1.25, size))}
          />
        </div>
      )}
      {live && !playing && !drag && hover && hoverAt && !isDrawTool(tool) && (
        <HoverCard doc={doc} t={t} sceneIndex={sceneIndex} id={hover} at={hoverAt} />
      )}
    </div>
  );
}

/**
 * What the player under the pointer is doing in this scene that the token does not
 * already show — the ball, a wait, a run that carries on, a position nobody saw —
 * so the board can be read without selecting anyone. Nothing of the kind, no card:
 * the token already says who he is.
 */
function HoverCard({
  doc,
  t,
  sceneIndex,
  id,
  at,
}: {
  doc: BoardDoc;
  t: number;
  sceneIndex: number;
  id: string;
  at: Vec2;
}) {
  const i18n = useI18n();
  const frame = frameAt(doc, t);
  const scene = frame.resolved.moving ? frame.resolved.to : doc.scenes[sceneIndex];
  if (!scene) return null;

  // The ball is always visible where it is, so it gets no card.
  if (id === BALL_ID) return null;
  const lines: string[] = [];
  const index = doc.scenes.indexOf(scene);
  const wait = scene.delay?.[id];
  if (index > 0 && wait) lines.push(i18n.t("hover.waits", { seconds: (wait / 1000).toFixed(1) }));
  if (runsThrough(doc, id, index)) lines.push(i18n.t("hover.runsOn"));
  if (scene.unseen?.includes(id)) lines.push(i18n.t("hover.unseen"));
  if (lines.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-56 rounded-md border border-ink-600 bg-ink-800/95 px-2 py-1.5 text-[11px] leading-snug text-ink-200 shadow-lg backdrop-blur"
      style={{ left: at.x + 14, top: at.y + 14 }}
    >
      {lines.map((line) => (
        <div key={line} className="text-ink-300">
          {line}
        </div>
      ))}
    </div>
  );
}


/** A point on the canvas element back into the space the board was drawn in. */
const unzoom = (at: Vec2, zoom: Zoom): Vec2 => ({
  x: (at.x - zoom.x) / zoom.z,
  y: (at.y - zoom.y) / zoom.z,
});

/**
 * Keep a zoom sensible: never smaller than the whole board, never past `MAX_ZOOM`,
 * and never panned so far that the board leaves its box.
 */
function clampZoom(zoom: Zoom, size: { w: number; h: number }): Zoom {
  const z = Math.min(Math.max(zoom.z, 1), MAX_ZOOM);
  if (z === 1) return NO_ZOOM;
  const clamp = (v: number, span: number) => Math.min(0, Math.max(span - span * z, v));
  return { z, x: clamp(zoom.x, size.w), y: clamp(zoom.y, size.h) };
}

/** Zoom by `factor` keeping the point under `at` where it is. */
function zoomAbout(zoom: Zoom, at: Vec2, factor: number, size: { w: number; h: number }): Zoom {
  const z = Math.min(Math.max(zoom.z * factor, 1), MAX_ZOOM);
  const k = z / zoom.z;
  return clampZoom({ z, x: at.x - (at.x - zoom.x) * k, y: at.y - (at.y - zoom.y) * k }, size);
}

/** How far, in metres, the pointer has to travel before a press on a player becomes a drag. */
const DRAG_START_M = 0.3;

/**
 * The zoom as a number you can type: "250" or "250%", applied on Enter or when the
 * field is left, kept between 100% and the most the board zooms. Holds its own text
 * while typing, so a half-typed value is not snapped back mid-edit.
 */
function ZoomField({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  label: string;
  onCommit: (zoom: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = `${Math.round(value * 100)}%`;
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace("%", "").replace(",", ".").trim());
    setDraft(null);
    if (Number.isFinite(n) && n > 0) onCommit(Math.min(Math.max(n / 100, 1), MAX_ZOOM));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft ?? shown}
      disabled={disabled}
      aria-label={label}
      title={label}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className="w-12 bg-transparent px-1 py-1 text-center outline-none focus:bg-ink-900 disabled:opacity-60"
    />
  );
}

/** Both layers a drawn shape can lie in. */
const LAYERS = ["mark", "zone"] as const;

/** How long the flat and 3D views take to cross-fade, in milliseconds. */
const TILT_FADE_MS = 320;

/** Longest reach of a freehand stroke from where it started. */
function spread(points: Vec2[]): number {
  const first = points[0];
  let worst = 0;
  for (const p of points) worst = Math.max(worst, Math.hypot(p.x - first.x, p.y - first.y));
  return worst;
}
