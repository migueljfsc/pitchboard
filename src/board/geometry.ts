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

// ---------------------------------------------------------------- bezier

/** A cubic curve. Endpoints come from two scenes; controls from the path. */
export type Bezier = { p0: Vec2; c1: Vec2; c2: Vec2; p1: Vec2 };

export function cubicAt(b: Bezier, u: number): Vec2 {
  const v = 1 - u;
  const a0 = v * v * v;
  const a1 = 3 * v * v * u;
  const a2 = 3 * v * u * u;
  const a3 = u * u * u;
  return {
    x: a0 * b.p0.x + a1 * b.c1.x + a2 * b.c2.x + a3 * b.p1.x,
    y: a0 * b.p0.y + a1 * b.c1.y + a2 * b.c2.y + a3 * b.p1.y,
  };
}

/** Unit tangent at `u`. Used to point arrowheads along the curve. */
export function cubicTangent(b: Bezier, u: number): Vec2 {
  const v = 1 - u;
  const d = {
    x: 3 * v * v * (b.c1.x - b.p0.x) + 6 * v * u * (b.c2.x - b.c1.x) + 3 * u * u * (b.p1.x - b.c2.x),
    y: 3 * v * v * (b.c1.y - b.p0.y) + 6 * v * u * (b.c2.y - b.c1.y) + 3 * u * u * (b.p1.y - b.c2.y),
  };
  const len = Math.hypot(d.x, d.y);
  return len < 1e-9 ? { x: 1, y: 0 } : { x: d.x / len, y: d.y / len };
}

export const ARC_SAMPLES = 64;

/** Cumulative arc length at each of ARC_SAMPLES + 1 uniform parameter steps. */
export type ArcTable = { cumulative: number[]; total: number };

export function buildArcTable(b: Bezier, samples = ARC_SAMPLES): ArcTable {
  const cumulative = new Array<number>(samples + 1);
  cumulative[0] = 0;
  let prev = b.p0;
  let run = 0;
  for (let i = 1; i <= samples; i++) {
    const p = cubicAt(b, i / samples);
    run += Math.hypot(p.x - prev.x, p.y - prev.y);
    cumulative[i] = run;
    prev = p;
  }
  return { cumulative, total: run };
}

/**
 * Invert the arc-length table: given a fraction `d` of total length, return the
 * curve parameter `u` that travels exactly that far.
 *
 * This is what stops players surging and stalling through curves. Sampling a
 * bezier at uniform `u` does NOT move at uniform speed — control points cluster
 * parameter space near the tighter regions of the curve — and it reads as broken
 * the first time you scrub a curved run.
 */
export function reparameterise(table: ArcTable, d: number): number {
  if (table.total < 1e-9) return d;
  const target = clamp(d, 0, 1) * table.total;
  const c = table.cumulative;
  const n = c.length - 1;

  // Binary search for the bracketing pair, then interpolate within it.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;

  const span = c[lo] - c[lo - 1];
  const within = span < 1e-12 ? 0 : (target - c[lo - 1]) / span;
  return (lo - 1 + within) / n;
}

/** Point at fraction `d` along the curve BY LENGTH, not by parameter. */
export function cubicAtDistance(b: Bezier, d: number, table = buildArcTable(b)): Vec2 {
  return cubicAt(b, reparameterise(table, d));
}
