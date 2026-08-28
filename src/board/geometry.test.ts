import { describe, expect, it } from "vitest";
import {
  ARC_SAMPLES,
  buildArcTable,
  clamp,
  cubicAt,
  cubicAtDistance,
  cubicTangent,
  distance,
  distanceToSegment,
  easeInOutCubic,
  easeOutQuad,
  fitViewport,
  lerp,
  lerpVec,
  reparameterise,
  toPitch,
  toScreen,
} from "./geometry";

describe("vectors", () => {
  it("lerps scalars and points", () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerpVec({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });

  it("measures distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("clamps", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("distanceToSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it("projects onto the segment interior", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3);
  });

  it("clamps past either end rather than extending the line", () => {
    expect(distanceToSegment({ x: -4, y: 0 }, a, b)).toBeCloseTo(4);
    expect(distanceToSegment({ x: 14, y: 0 }, a, b)).toBeCloseTo(4);
  });

  it("handles a degenerate zero-length segment", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBeCloseTo(5);
  });
});

describe("easing", () => {
  it("pins both ends", () => {
    for (const ease of [easeInOutCubic, easeOutQuad]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });

  it("easeInOutCubic is symmetric about the midpoint", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
  });

  it("easeOutQuad decelerates — a pass is struck hard and slows", () => {
    // Past the halfway point of the distance well before half the time.
    expect(easeOutQuad(0.5)).toBeGreaterThan(0.5);
  });
});

describe("viewport", () => {
  it("round-trips screen and pitch coordinates", () => {
    const v = fitViewport(1200, 800, 105, 68);
    const p = { x: 37.5, y: 12.25 };
    const back = toPitch(toScreen(p, v), v);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("centres the pitch in the box", () => {
    const v = fitViewport(1000, 1000, 105, 68);
    const topLeft = toScreen({ x: 0, y: 0 }, v);
    const bottomRight = toScreen({ x: 105, y: 68 }, v);
    expect(topLeft.x).toBeCloseTo(1000 - bottomRight.x);
    expect(topLeft.y).toBeCloseTo(1000 - bottomRight.y);
  });

  it("keeps the pitch inside the box at any aspect ratio", () => {
    for (const [w, h] of [[400, 1200], [1200, 400], [900, 900]]) {
      const v = fitViewport(w, h, 105, 68);
      const br = toScreen({ x: 105, y: 68 }, v);
      expect(br.x).toBeLessThanOrEqual(w + 1e-9);
      expect(br.y).toBeLessThanOrEqual(h + 1e-9);
    }
  });

  it("scales with the box, so the same doc renders identically at any size", () => {
    // This is what makes export resolution a one-line change: a 2x box yields
    // exactly 2x the scale, so nothing in the document needs to know the size.
    const a = fitViewport(600, 400, 105, 68);
    const b = fitViewport(1200, 800, 105, 68);
    expect(b.scale / a.scale).toBeCloseTo(2);
  });
});

describe("cubic bezier", () => {
  const b = { p0: { x: 0, y: 0 }, c1: { x: 5, y: 0 }, c2: { x: 10, y: 40 }, p1: { x: 60, y: 40 } };

  it("hits its endpoints exactly", () => {
    expect(cubicAt(b, 0)).toEqual(b.p0);
    expect(cubicAt(b, 1)).toEqual(b.p1);
  });

  it("reduces to a straight line when controls sit on it", () => {
    const line = {
      p0: { x: 0, y: 0 },
      c1: { x: 10, y: 10 },
      c2: { x: 20, y: 20 },
      p1: { x: 30, y: 30 },
    };
    const mid = cubicAt(line, 0.5);
    expect(mid.x).toBeCloseTo(15);
    expect(mid.y).toBeCloseTo(15);
  });

  it("returns a unit tangent pointing along the curve", () => {
    const tan = cubicTangent(b, 0);
    expect(Math.hypot(tan.x, tan.y)).toBeCloseTo(1);
    // Leaves p0 heading towards c1, which is straight along +x.
    expect(tan.x).toBeCloseTo(1);
    expect(tan.y).toBeCloseTo(0);
  });

  it("falls back to a valid tangent on a degenerate curve", () => {
    const dot = { p0: { x: 3, y: 3 }, c1: { x: 3, y: 3 }, c2: { x: 3, y: 3 }, p1: { x: 3, y: 3 } };
    const tan = cubicTangent(dot, 0.5);
    expect(Math.hypot(tan.x, tan.y)).toBeCloseTo(1);
  });
});

describe("arc-length reparameterisation", () => {
  // Deliberately lopsided: the controls bunch parameter space near the start, so
  // uniform u crawls through the first half and races the second.
  const curve = { p0: { x: 0, y: 0 }, c1: { x: 2, y: 0 }, c2: { x: 8, y: 45 }, p1: { x: 70, y: 45 } };

  const chords = (pointAt: (i: number) => { x: number; y: number }, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = pointAt(i / n);
      const b2 = pointAt((i + 1) / n);
      return Math.hypot(b2.x - a.x, b2.y - a.y);
    });

  const spread = (xs: number[]) => Math.max(...xs) / Math.min(...xs);

  it("measures a straight line's length correctly", () => {
    const line = {
      p0: { x: 0, y: 0 },
      c1: { x: 10, y: 0 },
      c2: { x: 20, y: 0 },
      p1: { x: 30, y: 0 },
    };
    expect(buildArcTable(line).total).toBeCloseTo(30, 3);
  });

  it("builds a monotonically increasing table", () => {
    const { cumulative, total } = buildArcTable(curve);
    expect(cumulative).toHaveLength(ARC_SAMPLES + 1);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[ARC_SAMPLES]).toBeCloseTo(total);
    for (let i = 1; i < cumulative.length; i++) {
      expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1]);
    }
  });

  it("pins both ends", () => {
    const table = buildArcTable(curve);
    expect(reparameterise(table, 0)).toBeCloseTo(0);
    expect(reparameterise(table, 1)).toBeCloseTo(1);
  });

  it("clamps out-of-range input rather than extrapolating", () => {
    const table = buildArcTable(curve);
    expect(reparameterise(table, -0.5)).toBeCloseTo(0);
    expect(reparameterise(table, 1.5)).toBeCloseTo(1);
  });

  it("moves at constant speed — the whole point of the exercise", () => {
    // Sampling at uniform PARAMETER makes a player surge and stall visibly...
    const rawSpread = spread(chords((u) => cubicAt(curve, u), 20));
    expect(rawSpread).toBeGreaterThan(1.5);

    // ...whereas sampling at uniform LENGTH does not.
    const table = buildArcTable(curve);
    const evenSpread = spread(chords((d) => cubicAtDistance(curve, d, table), 20));
    expect(evenSpread).toBeLessThan(1.05);
  });

  it("degrades gracefully on a zero-length curve", () => {
    const dot = { p0: { x: 5, y: 5 }, c1: { x: 5, y: 5 }, c2: { x: 5, y: 5 }, p1: { x: 5, y: 5 } };
    const table = buildArcTable(dot);
    expect(table.total).toBeCloseTo(0);
    expect(() => cubicAtDistance(dot, 0.5, table)).not.toThrow();
    expect(cubicAtDistance(dot, 0.5, table)).toEqual({ x: 5, y: 5 });
  });
});
