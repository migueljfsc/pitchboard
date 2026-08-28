/**
 * Vector, easing and viewport maths. Pure, framework-free, metre-based.
 *
 * Cubic bezier evaluation and arc-length reparameterisation land in M2; the
 * curved-run animation depends on them and they are the trickiest part of the
 * engine (see the trap note in AGENTS.md).
 */

import type { Vec2, Viewport } from "./types";

// ---------------------------------------------------------------- vectors

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scaleVec = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

export const lerpVec = (a: Vec2, b: Vec2, u: number): Vec2 => ({
  x: lerp(a.x, b.x, u),
  y: lerp(a.y, b.y, u),
});

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Shortest distance from point `p` to segment `a`-`b`.
 * Used for link-edge hit-testing.
 */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const u = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return distance(p, { x: a.x + u * dx, y: a.y + u * dy });
}

// ---------------------------------------------------------------- easing

export const easeInOutCubic = (u: number): number =>
  u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

/** Struck hard, decelerating — used for passes, not for player movement. */
export const easeOutQuad = (u: number): number => 1 - (1 - u) * (1 - u);

export const linear = (u: number): number => u;

// ---------------------------------------------------------------- viewport

export const toScreen = (p: Vec2, v: Viewport): Vec2 => ({
  x: p.x * v.scale + v.offsetX,
  y: p.y * v.scale + v.offsetY,
});

export const toPitch = (p: Vec2, v: Viewport): Vec2 => ({
  x: (p.x - v.offsetX) / v.scale,
  y: (p.y - v.offsetY) / v.scale,
});

/**
 * Fit a `length` x `width` pitch into a `cw` x `ch` box, centred, with `padding`
 * metres of margin on every side.
 *
 * Returns CSS pixels per metre plus the centring offsets. Because the result is
 * derived purely from the box size, the same document renders identically at any
 * canvas size — which is what makes export resolution a one-line change.
 */
export function fitViewport(
  cw: number,
  ch: number,
  length: number,
  width: number,
  padding = 3,
): Viewport {
  const scale = Math.min(cw / (length + padding * 2), ch / (width + padding * 2));
  return {
    scale,
    offsetX: (cw - length * scale) / 2,
    offsetY: (ch - width * scale) / 2,
  };
}
