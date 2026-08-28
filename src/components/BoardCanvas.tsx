/**
 * Canvas host: owns sizing, DPR and pointer input, and calls drawBoard.
 *
 * It deliberately holds no board logic. Hit-testing and edits live in
 * src/board/interaction.ts so the renderer and the engine stay usable from the
 * export worker, where none of this exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardDoc, PitchView, Vec2 } from "@/board/types";
import { BALL_ID, DEFAULT_PITCH_VIEW } from "@/board/types";
import { fitViewport, toPitch } from "@/board/geometry";
import { drawBoard } from "@/board/render";
import { frameAt } from "@/board/timeline";
import {
  applySelection,
  dragHandle,
  entitiesInRect,
  hitTest,
  hitTestHandle,
  hitTestLink,
  moveEntities,
  type HandleHit,
} from "@/board/interaction";
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
  onDocChange: (next: BoardDoc) => void;
  /** A double-click on a player asks to rename it. The ball has no name. */
  onEditName?: (playerId: string) => void;
};

type Drag =
  | { kind: "move"; last: Vec2 }
  | { kind: "handle"; hit: HandleHit }
  | { kind: "marquee"; a: Vec2; b: Vec2; additive: boolean }
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
    });
  }, [doc, t, size, selection, hover, drag, editScene, pitchView]);

  const pointFrom = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Vec2 => {
      const rect = e.currentTarget.getBoundingClientRect();
      const view = fitViewport(rect.width, rect.height, doc.pitch.length, doc.pitch.width, pitchView);
      return toPitch({ x: e.clientX - rect.left, y: e.clientY - rect.top }, view);
    },
    [doc.pitch.length, doc.pitch.width, pitchView],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFrom(e);
    e.currentTarget.setPointerCapture(e.pointerId);

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
    const hit = hitTest(doc, frame, p);
    if (hit) {
      // Dragging one of several selected entities moves the whole unit; grabbing
      // an unselected one selects it first.
      if (!selection.has(hit.id)) {
        onSelectionChange(applySelection(selection, hit, e.shiftKey));
      }
      setDrag({ kind: "move", last: p });
      return;
    }

    // A connector runs under its players, so it is only reachable on empty grass.
    const link = hitTestLink(doc, frame.resolved, p);
    if (link) {
      onSelectionChange(new Set(e.shiftKey ? [...selection, ...link.members] : link.members));
      return;
    }

    if (!e.shiftKey) onSelectionChange(new Set());
    setDrag({ kind: "marquee", a: p, b: p, additive: e.shiftKey });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFrom(e);

    if (!drag) {
      setHover(hitTest(doc, frameAt(doc, t), p)?.id ?? null);
      return;
    }

    if (drag.kind === "handle") {
      if (editScene === undefined) return;
      const curve = dragHandle(doc, editScene, drag.hit, p);
      if (curve) onDocChange(setPath(doc, editScene, drag.hit.id, curve));
      return;
    }

    if (drag.kind === "move") {
      const delta = { x: p.x - drag.last.x, y: p.y - drag.last.y };
      if (delta.x !== 0 || delta.y !== 0) {
        onDocChange(moveEntities(doc, sceneIndex, selection, delta));
        setDrag({ kind: "move", last: p });
      }
      return;
    }

    setDrag({ ...drag, b: p });
  };

  /**
   * Double-click a player to rename it. Narrows the selection to that one player
   * first: renaming is a single-player edit, and the panel only offers the field
   * when exactly one is selected.
   */
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onEditName) return;
    const hit = hitTest(doc, frameAt(doc, t), pointFrom(e));
    if (!hit || hit.id === BALL_ID) return;
    onSelectionChange(new Set([hit.id]));
    onEditName(hit.id);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag?.kind === "marquee") {
      const inside = entitiesInRect(doc, frameAt(doc, t), drag.a, drag.b);
      const next = drag.additive ? new Set(selection) : new Set<string>();
      for (const id of inside) next.add(id);
      onSelectionChange(next);
    }
    setDrag(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div ref={wrapRef} className="h-full w-full">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{
          cursor:
            drag?.kind === "move" || drag?.kind === "handle"
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
