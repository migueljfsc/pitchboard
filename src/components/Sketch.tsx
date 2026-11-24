import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SketchKind = "select" | "draw" | "board";

/**
 * A coach's chalk drawing for an empty state (D128): what to do next, drawn the way it would be
 * on a whiteboard. Clean strokes — at this size chalk grain only blurs.
 */
export function Sketch({ kind, className }: { kind: SketchKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      aria-hidden
      className={cn("block h-10 w-16 shrink-0", className)}
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.7"
    >
      {SKETCHES[kind]}
    </svg>
  );
}

const SKETCHES: Record<SketchKind, ReactNode> = {
  // A player, and a hand reaching for him.
  select: (
    <>
      <circle cx="18" cy="17" r="6" />
      <circle cx="18" cy="17" r="11" strokeDasharray="2.5 3" opacity="0.6" />
      <path d="M54 34 C 46 34, 38 31, 32 25" />
      <path d="M32 25 l1.1 4.4 M32 25 l4.5 0.3" />
    </>
  ),
  // A run bent into space, and the zone it ends in.
  draw: (
    <>
      <path d="M5 33 C 12 8, 26 30, 36 13" />
      <path d="M36 13 l-0.6 4.6 M36 13 l-4.2 1.9" />
      <ellipse cx="50" cy="25" rx="10" ry="7" strokeDasharray="3 3" />
    </>
  ),
  // A board with nothing on it yet.
  board: (
    <>
      <rect x="5" y="5" width="54" height="30" rx="1.5" />
      <path d="M32 5 v30" />
      <circle cx="32" cy="20" r="5" />
      <path d="M5 13 h7 v14 h-7 M59 13 h-7 v14 h7" />
    </>
  ),
};
