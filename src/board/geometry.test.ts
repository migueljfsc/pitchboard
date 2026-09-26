import { describe, expect, it } from "vitest";
import {
  buildArcTable,
  cubicAt,
  cubicAtDistance,
  cubicTangent,
  distanceToSegment,
  fitViewport,
  reparameterise,
  toPitch,
  toScreen,
} from "./geometry";

describe("distanceToSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it("measures to the segment, not the line through it", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3);
    expect(distanceToSegment({ x: -4, y: 0 }, a, b)).toBeCloseTo(4);
    expect(distanceToSegment({ x: 14, y: 0 }, a, b)).toBeCloseTo(4);
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBeCloseTo(5);
  });
});

describe("viewport", () => {
  it("round-trips screen and pitch coordinates in every framing", () => {
    for (const half of ["full", "left", "right"] as const) {
      for (const rotated of [false, true]) {
        const v = fitViewport(1200, 800, 105, 68, { half, rotated });
        for (const p of [{ x: 52.5, y: 34 }, { x: 37.5, y: 12.25 }, { x: 105, y: 68 }]) {
          const back = toPitch(toScreen(p, v), v);
          expect(back.x).toBeCloseTo(p.x, 9);
          expect(back.y).toBeCloseTo(p.y, 9);
        }
      }
    }
  });

  it("keeps the pitch inside and centred in the box at any aspect ratio", () => {
    for (const [w, h] of [[400, 1200], [1200, 400], [900, 900]]) {
      const v = fitViewport(w, h, 105, 68);
      const tl = toScreen({ x: 0, y: 0 }, v);
      const br = toScreen({ x: 105, y: 68 }, v);
      expect(br.x).toBeLessThanOrEqual(w + 1e-9);
      expect(br.y).toBeLessThanOrEqual(h + 1e-9);
      expect(tl.x).toBeCloseTo(w - br.x);
      expect(tl.y).toBeCloseTo(h - br.y);
    }
  });

  it("rotated, puts the attacking end at the top of the screen", () => {
    const v = fitViewport(1200, 800, 105, 68, { half: "full", rotated: true });
    const ownGoal = toScreen({ x: 0, y: 34 }, v);
    const farGoal = toScreen({ x: 105, y: 34 }, v);
    expect(farGoal.y).toBeLessThan(ownGoal.y);
    expect(farGoal.x).toBeCloseTo(ownGoal.x);
  });

  it("puts the chosen half in the middle of the box, zoomed where the box allows", () => {
    const left = fitViewport(1200, 800, 105, 68, { half: "left", rotated: false });
    const right = fitViewport(1200, 800, 105, 68, { half: "right", rotated: false });
    expect(toScreen({ x: 26.25, y: 34 }, left).x).toBeCloseTo(600);
    expect(toScreen({ x: 78.75, y: 34 }, right).x).toBeCloseTo(600);

    // Rotated, the half is 68 x 52.5 and genuinely fills a landscape box.
    const fullRotated = fitViewport(1200, 800, 105, 68, { half: "full", rotated: true });
    const halfRotated = fitViewport(1200, 800, 105, 68, { half: "left", rotated: true });
    expect(halfRotated.scale / fullRotated.scale).toBeGreaterThan(1.8);
  });

  // Invariant 2: the document never learns the size it is drawn at. A 2x box is exactly 2x the
  // scale, which is why resizing never moves a player and export resolution is one number.
  it("scales with the box, so the same doc renders identically at any size", () => {
    for (const view of [undefined, { half: "right", rotated: true } as const]) {
      const a = fitViewport(600, 400, 105, 68, view);
      const b = fitViewport(1200, 800, 105, 68, view);
      expect(b.scale / a.scale).toBeCloseTo(2);
      const p = { x: 70, y: 20 };
      const pa = toScreen(p, a);
      const pb = toScreen(p, b);
      expect(pb.x).toBeCloseTo(pa.x * 2);
      expect(pb.y).toBeCloseTo(pa.y * 2);
    }
  });
});

describe("cubic bezier", () => {
  const b = { p0: { x: 0, y: 0 }, c1: { x: 5, y: 0 }, c2: { x: 10, y: 40 }, p1: { x: 60, y: 40 } };

  it("hits its endpoints and leaves along its first control", () => {
    expect(cubicAt(b, 0)).toEqual(b.p0);
    expect(cubicAt(b, 1)).toEqual(b.p1);
    const tan = cubicTangent(b, 0);
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

  it("moves at constant speed — the whole point of the exercise", () => {
    // Sampling at uniform PARAMETER makes a player surge and stall visibly...
    const rawSpread = spread(chords((u) => cubicAt(curve, u), 20));
    expect(rawSpread).toBeGreaterThan(1.5);

    // ...whereas sampling at uniform LENGTH does not.
    const table = buildArcTable(curve);
    const evenSpread = spread(chords((d) => cubicAtDistance(curve, d, table), 20));
    expect(evenSpread).toBeLessThan(1.05);
  });

  it("clamps out-of-range input rather than extrapolating", () => {
    const table = buildArcTable(curve);
    expect(reparameterise(table, -0.5)).toBeCloseTo(0);
    expect(reparameterise(table, 1.5)).toBeCloseTo(1);
  });

  it("degrades gracefully on a zero-length curve", () => {
    const dot = { p0: { x: 5, y: 5 }, c1: { x: 5, y: 5 }, c2: { x: 5, y: 5 }, p1: { x: 5, y: 5 } };
    const table = buildArcTable(dot);
    expect(table.total).toBeCloseTo(0);
    expect(cubicAtDistance(dot, 0.5, table)).toEqual({ x: 5, y: 5 });
  });
});
