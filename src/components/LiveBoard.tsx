import { useEffect, useRef, useState } from "react";
import type { BoardDoc, PitchView, TurfCache } from "@/board/types";
import { DEFAULT_PITCH_VIEW } from "@/board/types";
import { fitViewport } from "@/board/geometry";
import { framingOf } from "@/board/projection";
import { drawBoard } from "@/board/render";
import { totalSeconds } from "@/board/scenes";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  view?: PitchView;
  /** Where a still board rests when motion is reduced, as a fraction of the play. */
  still?: number;
  className?: string;
  label: string;
};

/**
 * A board playing on a loop, for show: the same `drawBoard` the editor and every export
 * use, so what the landing page promises is exactly what the app draws.
 *
 * It plays only while on screen, and not at all for a reader who asked for less motion —
 * they get one frame from the middle of the move instead. The surround is left unpainted, so
 * the pitch sits on the page rather than in a box.
 */
export function LiveBoard({ doc, view = DEFAULT_PITCH_VIEW, still = 0.5, className, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const turf = useRef<TurfCache>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [onScreen, setOnScreen] = useState(false);
  // Animation frames already stop in a background tab; this says so outright, so the loop
  // is cancelled rather than merely starved.
  const [pageShown, setPageShown] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const onChange = () => setPageShown(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: "80px",
    });
    ro.observe(el);
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.w === 0 || size.h === 0) return;

    // DPR lives in the canvas transform and nowhere else.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);

    const framing = framingOf(view);
    const fit = fitViewport(size.w, size.h, doc.pitch.length, doc.pitch.width, framing);
    const total = Math.max(totalSeconds(doc), 0.001);
    const paint = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      drawBoard(ctx, doc, t, {
        ...fit,
        width: size.w,
        height: size.h,
        interactive: false,
        transparent: true,
        turf: turf.current,
        tilt: framing.tilt,
        sceneCamera: true,
      });
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !onScreen || !pageShown) {
      paint(total * still);
      return;
    }

    // Thirty frames a second: a play reads as well at it, and a page of boards drawing at the
    // display's full rate is a laptop's fan for nothing.
    const start = performance.now() - total * still * 1000;
    let drawn = -Infinity;
    let frame = requestAnimationFrame(function tick(now) {
      if (now - drawn >= FRAME_MS) {
        drawn = now;
        paint(((now - start) / 1000) % total);
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [doc, view, size, onScreen, pageShown, still]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

/** How often a showcase board is redrawn: thirty frames a second, a hair under so a 60 Hz tick is never skipped. */
const FRAME_MS = 1000 / 30 - 2;
