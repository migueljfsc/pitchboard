/**
 * Canvas host: owns sizing, DPR and pointer input, and calls drawBoard.
 *
 * It deliberately holds no board logic. Hit-testing and edits live in
 * src/board/interaction.ts so the renderer and the engine stay usable from the
 * export worker, where none of this exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardDoc, Vec2 } from "@/board/types";
import { fitViewport, toPitch } from "@/board/geometry";
import { drawBoard, frameAt } from "@/board/render";
import {
  applySelection,
  entitiesInRect,
  hitTest,
  moveEntities,
} from "@/board/interaction";

type Props = {
  doc: BoardDoc;
  t: number;
  sceneIndex: number;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  onDocChange: (next: BoardDoc) => void;
};

type Drag =
  | { kind: "move"; last: Vec2 }
  | { kind: "marquee"; a: Vec2; b: Vec2; additive: boolean }
  | null;

export function BoardCanvas({
  doc,
  t,
  sceneIndex,
  selection,
  onSelectionChange,
  onDocChange,
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

    const view = fitViewport(size.w, size.h, doc.pitch.length, doc.pitch.width);
    drawBoard(ctx, doc, t, {
      ...view,
      width: size.w,
      height: size.h,
      interactive: true,
      selection,
      hover,
      marquee: drag?.kind === "marquee" ? { a: drag.a, b: drag.b } : null,
    });
  }, [doc, t, size, selection, hover, drag]);

  const pointFrom = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Vec2 => {
      const rect = e.currentTarget.getBoundingClientRect();
      const view = fitViewport(rect.width, rect.height, doc.pitch.length, doc.pitch.width);
      return toPitch({ x: e.clientX - rect.left, y: e.clientY - rect.top }, view);
    },
    [doc.pitch.length, doc.pitch.width],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointFrom(e);
    const hit = hitTest(doc, frameAt(doc, t), p);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (hit) {
      // Dragging one of several selected entities moves the whole unit; grabbing
      // an unselected one selects it first.
      if (!selection.has(hit.id)) {
        onSelectionChange(applySelection(selection, hit, e.shiftKey));
      }
      setDrag({ kind: "move", last: p });
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
        style={{ cursor: drag?.kind === "move" ? "grabbing" : hover ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
      />
    </div>
  );
}
