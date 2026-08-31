/**
 * Canvas host: owns sizing, DPR and pointer input, and calls drawBoard.
 *
 * It deliberately holds no board logic. Hit-testing and edits live in
 * src/board/interaction.ts so the renderer and the engine stay usable from the
 * export worker, where none of this exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Annotation, BoardDoc, PitchView, Tool, Vec2 } from "@/board/types";
import type { Change } from "@/lib/history";
import { BALL_ID, DEFAULT_PITCH_VIEW } from "@/board/types";
import { fitViewport, toPitch } from "@/board/geometry";
import { cameraFor, framingOf, unprojectPitch } from "@/board/projection";
import { drawBoard } from "@/board/render";
import { frameAt } from "@/board/timeline";
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
  moveEntities,
  type AnnotationHandleHit,
  type Carry,
  type HandleHit,
} from "@/board/interaction";
import {
  MIN_DRAG,
  addAnnotation,
  draftAnnotation,
  dragAnnotationHandle,
  moveAnnotation,
  simplify,
  updateAnnotation,
} from "@/board/annotations";
import { setPath } from "@/board/scenes";

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
  /** Keep the tool armed after a shape is drawn, for drawing several in a row. */
  sticky?: boolean;
  annotationSelection?: string | null;
  onAnnotationSelect?: (id: string | null) => void;
  /**
   * False for read-only playback: no pointer handling and no editor chrome.
   * The renderer already draws that distinction — this is the same flag the
   * exporter passes, so a shared board looks exactly like an exported frame.
   */
  interactive?: boolean;
};

type Drag =
  | { kind: "move"; last: Vec2; carry: Carry }
  | { kind: "handle"; hit: HandleHit }
  | { kind: "marquee"; a: Vec2; b: Vec2; additive: boolean }
  /** Dragging a new shape out. `start` is the anchor; `ann` is the live preview. */
  | { kind: "draw"; start: Vec2; points: Vec2[]; ann: Annotation }
  | { kind: "ann-move"; id: string; last: Vec2 }
  | { kind: "ann-handle"; hit: AnnotationHandleHit }
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
  tool = "select",
  onToolChange,
  drawColor = "#fbbf24",
  drawDash = "solid",
  sticky = false,
  annotationSelection = null,
  onAnnotationSelect,
  interactive = true,
}: Props) {
  /**
   * Two gates, not one (D48).
   *
   * `live` is any pointer input at all, and the angled view now has it: selecting,
   * shift-selecting, sweeping a marquee, clicking a connector, clicking empty grass
   * to clear. Everything the panels then offer — link, colours, highlight, kit,
   * rename, restyle a shape — is an edit to the document and never cared which way
   * the board was being looked at.
   *
   * `canPlace` is editing by POSITION: dragging entities, run handles, drawing and
   * moving shapes. That stays flat. The old objection was grab margins — a metre
   * near the camera is a lot more pixels than a metre at the far touchline — and it
   * is an objection to dragging, not to clicking: a hit test can be run against the
   * pixels a billboard actually occupies, and `hitTestTilted` is.
   */
  const live = interactive;
  const canPlace = interactive && !pitchView.tilt;
  const tilted = !!framingOf(pitchView).tilt;

  /**
   * What a drag on empty grass does, given where we are.
   *
   * A tool left armed in 2D would otherwise make every click in 3D do nothing at
   * all. It falls back to select there and is picked straight back up on the way
   * out, which is better than a live tool that quietly refuses.
   */
  const activeTool: Tool = canPlace ? tool : "select";

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
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const framing = framingOf(pitchView);
    const view = fitViewport(size.w, size.h, doc.pitch.length, doc.pitch.width, framing);
    drawBoard(ctx, doc, t, {
      ...view,
      width: size.w,
      height: size.h,
      interactive: live,
      tilt: framing.tilt,
      selection,
      hover,
      editScene,
      ghosts,
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
  ]);

  /** Where the pointer is on the canvas, in CSS pixels. What a billboard is tested with. */
  const screenFrom = (e: React.MouseEvent<HTMLCanvasElement>): Vec2 => {
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
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    [doc.pitch, pitchView],
  );

  /** Scene the annotations are keyed to — the one being played into. */
  const annotationScene = () => frameAt(doc, t).resolved.index;

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
    gesture.current += 1;
    const p = pointFrom(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    // A drawing tool takes the whole gesture: no selecting, no marquee.
    if (activeTool !== "select") {
      startDrawing(p);
      return;
    }

    // Handles are grabbed, and a grab is positional. Neither kind exists in 3D,
    // which is also why neither is drawn there.
    if (canPlace) {
      // The selected shape's own handles come first, above even run handles: they
      // are drawn on top of everything and are the most deliberate target there is.
      const annHandle = hitTestAnnotationHandle(
        doc,
        annotationScene(),
        annotationSelection,
        p,
        rotated,
      );
      if (annHandle) {
        setDrag({ kind: "ann-handle", hit: annHandle });
        return;
      }

      // Control handles win over tokens: they can overlap one, and they are the
      // smaller, more deliberate target.
      if (editScene !== undefined) {
        const handle = hitTestHandle(doc, editScene, selection, p);
        if (handle) {
          setDrag({ kind: "handle", hit: handle });
          return;
        }
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
        return;
      }

      const standing = hitTestTilted(doc, frame, screen, cam);
      if (standing) {
        onAnnotationSelect?.(null);
        onSelectionChange(applySelection(selection, standing, e.shiftKey));
        return;
      }

      for (const layer of ["mark", "zone"] as const) {
        const ann = hitTestGroundAnnotation(doc, scene, p, layer);
        if (ann) {
          selectAnnotation(ann.id);
          return;
        }
      }

      const unit = hitTestLink(doc, frame.resolved, p);
      if (unit) {
        onAnnotationSelect?.(null);
        onSelectionChange(new Set(e.shiftKey ? [...selection, ...unit.members] : unit.members));
        return;
      }

      onAnnotationSelect?.(null);
      if (!e.shiftKey) onSelectionChange(new Set());
      // In pitch metres, like the flat one: the corners were turned back into
      // places on the grass, so the sweep is an area of pitch and warps with it.
      setDrag({ kind: "marquee", a: p, b: p, additive: e.shiftKey });
      return;
    }

    // Marks are drawn above the tokens, so they take a click from one. Zones are
    // drawn below and are tested after. Hit-testing mirrors the draw order.
    const mark = hitTestAnnotation(doc, scene, p, "mark", rotated);
    if (mark) {
      selectAnnotation(mark.id);
      setDrag({ kind: "ann-move", id: mark.id, last: p });
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
      setDrag({ kind: "move", last: p, carry: e.altKey ? "scene" : carry });
      return;
    }

    const zone = hitTestAnnotation(doc, scene, p, "zone", rotated);
    if (zone) {
      selectAnnotation(zone.id);
      setDrag({ kind: "ann-move", id: zone.id, last: p });
      return;
    }

    // A connector runs under its players, so it is only reachable on empty grass.
    const link = hitTestLink(doc, frame.resolved, p);
    if (link) {
      onAnnotationSelect?.(null);
      onSelectionChange(new Set(e.shiftKey ? [...selection, ...link.members] : link.members));
      return;
    }

    onAnnotationSelect?.(null);
    if (!e.shiftKey) onSelectionChange(new Set());
    setDrag({ kind: "marquee", a: p, b: p, additive: e.shiftKey });
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
   * immediately and hands the panel the cursor for its content.
   */
  const startDrawing = (p: Vec2) => {
    if (activeTool === "select") return;
    const sceneId = doc.scenes[annotationScene()]?.id ?? doc.scenes[0].id;
    const ann = draftAnnotation(doc, activeTool, sceneId, p, p, {
      color: drawColor,
      dash: drawDash,
      points: [p],
    });

    if (activeTool === "text") {
      onDocChange(addAnnotation(doc, ann));
      onAnnotationSelect?.(ann.id);
      onToolChange?.("select");
      return;
    }
    setDrag({ kind: "draw", start: p, points: [p], ann });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFrom(e);

    if (!drag) {
      if (activeTool !== "select") {
        setHover(null);
        setGrip(null);
        return;
      }
      if (tilted) {
        // No handles to promise, so no grip — only what a click would select.
        setGrip(null);
        setHover(hitTestTilted(doc, frameAt(doc, t), screenFrom(e), cameraFrom(e))?.id ?? null);
        return;
      }
      // Same order as pointerdown: the shape's own handles, then run handles,
      // then the tokens. The cursor has to promise what the click will do.
      const annHandle = hitTestAnnotationHandle(
        doc,
        annotationScene(),
        annotationSelection,
        p,
        rotated,
      );
      const onHandle =
        annHandle ?? (editScene === undefined ? null : hitTestHandle(doc, editScene, selection, p));
      setGrip(annHandle?.which === "w" ? "resize" : onHandle ? "grab" : null);
      setHover(hitTest(doc, frameAt(doc, t), p)?.id ?? null);
      return;
    }

    if (drag.kind === "handle") {
      if (editScene === undefined) return;
      const curve = dragHandle(doc, editScene, drag.hit, p);
      if (curve) onDocChange(setPath(doc, editScene, drag.hit.id, curve), dragKey());
      return;
    }

    if (drag.kind === "move") {
      const delta = { x: p.x - drag.last.x, y: p.y - drag.last.y };
      if (delta.x !== 0 || delta.y !== 0) {
        onDocChange(moveEntities(doc, sceneIndex, selection, delta, drag.carry), dragKey());
        setDrag({ kind: "move", last: p, carry: drag.carry });
      }
      return;
    }

    if (drag.kind === "ann-move") {
      const delta = { x: p.x - drag.last.x, y: p.y - drag.last.y };
      if (delta.x !== 0 || delta.y !== 0) {
        onDocChange(moveAnnotation(doc, drag.id, delta), dragKey());
        setDrag({ kind: "ann-move", id: drag.id, last: p });
      }
      return;
    }

    if (drag.kind === "ann-handle") {
      const ann = (doc.annotations ?? []).find((a) => a.id === drag.hit.id);
      if (!ann) return;
      onDocChange(
        updateAnnotation(doc, ann.id, dragAnnotationHandle(ann, drag.hit.which, p, rotated)),
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
    // Text commits on the click that creates it, so it never reaches a draft.
    if (drag.ann.kind === "text") return drag;
    return { ...drag, ann: { ...drag.ann, a: drag.start, b: p } };
  };

  /**
   * Double-click a player to rename it. Narrows the selection to that one player
   * first: renaming is a single-player edit, and the panel only offers the field
   * when exactly one is selected.
   */
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onEditName || activeTool !== "select") return;
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

    if (drag?.kind === "marquee") {
      const inside = entitiesInRect(doc, frameAt(doc, t), drag.a, drag.b);
      const next = drag.additive ? new Set(selection) : new Set<string>();
      for (const id of inside) next.add(id);
      onSelectionChange(next);
    }

    // Commit from where the pointer actually came up, not from the last state
    // the moves happened to leave behind. A drag fast enough to skip its final
    // pointermove would otherwise commit a zero-size shape and be discarded.
    if (drag?.kind === "draw") commitDraft(drag, p);

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

    if (ann.kind === "text") return;

    const drawn =
      ann.kind === "pen"
        ? ann.points.length >= 2 && spread(ann.points) >= MIN_DRAG
        : Math.hypot(ann.b.x - ann.a.x, ann.b.y - ann.a.y) >= MIN_DRAG;

    if (!drawn) return;

    onDocChange(addAnnotation(doc, ann));
    onAnnotationSelect?.(ann.id);
    // Back to select unless the tool is pinned: one accidental extra arrow is
    // more annoying than one extra click.
    if (!sticky) onToolChange?.("select");
  };

  /**
   * The pointer's job, as a CSS cursor.
   *
   * The width handle resizes along the pitch's x-axis, which is down the screen
   * once the board is stood on end — so the arrows follow the framing rather than
   * the document, or they point across the one direction the drag cannot go.
   */
  const cursor = (): string => {
    if (!live) return "default";
    if (activeTool !== "select") return "crosshair";
    const resize = rotated ? "ns-resize" : "ew-resize";
    if (drag?.kind === "ann-handle") return drag.hit.which === "w" ? resize : "grabbing";
    if (drag?.kind === "move" || drag?.kind === "handle" || drag?.kind === "ann-move") {
      return "grabbing";
    }
    if (grip === "resize") return resize;
    return grip === "grab" || hover ? "grab" : "default";
  };

  return (
    <div ref={wrapRef} className="h-full w-full">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor: cursor() }}
        onPointerDown={live ? onPointerDown : undefined}
        onPointerMove={live ? onPointerMove : undefined}
        onPointerUp={live ? onPointerUp : undefined}
        onPointerLeave={() => {
          setHover(null);
          setGrip(null);
        }}
        onDoubleClick={live ? onDoubleClick : undefined}
      />
    </div>
  );
}

/** Longest reach of a freehand stroke from where it started. */
function spread(points: Vec2[]): number {
  const first = points[0];
  let worst = 0;
  for (const p of points) worst = Math.max(worst, Math.hypot(p.x - first.x, p.y - first.y));
  return worst;
}
