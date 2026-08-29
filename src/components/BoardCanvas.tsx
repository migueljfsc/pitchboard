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
import { drawBoard } from "@/board/render";
import { frameAt } from "@/board/timeline";
import {
  applySelection,
  dragHandle,
  entitiesInRect,
  hitTest,
  hitTestAnnotation,
  hitTestAnnotationHandle,
  hitTestHandle,
  hitTestLink,
  moveEntities,
  type AnnotationHandleHit,
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
};

type Drag =
  | { kind: "move"; last: Vec2 }
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
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
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

    const view = fitViewport(size.w, size.h, doc.pitch.length, doc.pitch.width, pitchView);
    drawBoard(ctx, doc, t, {
      ...view,
      width: size.w,
      height: size.h,
      interactive: true,
      selection,
      hover,
      editScene,
      marquee: drag?.kind === "marquee" ? { a: drag.a, b: drag.b } : null,
      annotationSelection,
      draft: drag?.kind === "draw" ? drag.ann : null,
    });
  }, [doc, t, size, selection, hover, drag, editScene, pitchView, annotationSelection]);

  const pointFrom = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Vec2 => {
      const rect = e.currentTarget.getBoundingClientRect();
      const view = fitViewport(rect.width, rect.height, doc.pitch.length, doc.pitch.width, pitchView);
      return toPitch({ x: e.clientX - rect.left, y: e.clientY - rect.top }, view);
    },
    [doc.pitch.length, doc.pitch.width, pitchView],
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
    if (tool !== "select") {
      startDrawing(p);
      return;
    }

    // The selected shape's own handles come first, above even run handles: they
    // are drawn on top of everything and are the most deliberate target there is.
    const annHandle = hitTestAnnotationHandle(doc, annotationScene(), annotationSelection, p);
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

    const frame = frameAt(doc, t);
    const scene = frame.resolved.index;

    // Marks are drawn above the tokens, so they take a click from one. Zones are
    // drawn below and are tested after. Hit-testing mirrors the draw order.
    const mark = hitTestAnnotation(doc, scene, p, "mark");
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
      setDrag({ kind: "move", last: p });
      return;
    }

    const zone = hitTestAnnotation(doc, scene, p, "zone");
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
    if (tool === "select") return;
    const sceneId = doc.scenes[annotationScene()]?.id ?? doc.scenes[0].id;
    const ann = draftAnnotation(doc, tool, sceneId, p, p, {
      color: drawColor,
      dash: drawDash,
      points: [p],
    });

    if (tool === "text") {
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
      setHover(tool === "select" ? (hitTest(doc, frameAt(doc, t), p)?.id ?? null) : null);
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
        onDocChange(moveEntities(doc, sceneIndex, selection, delta), dragKey());
        setDrag({ kind: "move", last: p });
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
        updateAnnotation(doc, ann.id, dragAnnotationHandle(ann, drag.hit.which, p)),
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
    if (!onEditName || tool !== "select") return;
    const hit = hitTest(doc, frameAt(doc, t), pointFrom(e));
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

  return (
    <div ref={wrapRef} className="h-full w-full">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{
          cursor:
            tool !== "select"
              ? "crosshair"
              : drag?.kind === "move" || drag?.kind === "handle" || drag?.kind === "ann-move"
                ? "grabbing"
                : hover
                  ? "grab"
                  : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
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
