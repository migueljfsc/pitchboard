import { describe, expect, it } from "vitest";
import {
  clamp,
  distance,
  distanceToSegment,
  easeInOutCubic,
  easeOutQuad,
  fitViewport,
  lerp,
  lerpVec,
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
