import { describe, expect, it } from "vitest";
import {
  CAMERA_DISTANCE,
  GROUND_SQUASH,
  TILT,
  framingOf,
  projectionFor,
  tiltedAspect,
} from "./projection";
import { PITCH_PADDING } from "./pitch";

/** A full pitch with its grass band, as the renderer hands it over. */
const ACROSS = 68 + PITCH_PADDING * 2;
const ALONG = 105 + PITCH_PADDING * 2;

const build = (w = 900, h = 900, dpr = 1) => projectionFor(ACROSS, ALONG, w, h, dpr);

describe("projectionFor", () => {
  it("keeps the board inside the canvas", () => {
    const p = build(1000, 700);
    const nearHalf = (p.contentAcross / 2) * p.depthScale(1);

    expect(p.top).toBeGreaterThanOrEqual(-1e-9);
    expect(p.bottom).toBeLessThanOrEqual(700 + 1e-9);
    expect(nearHalf * 2).toBeLessThanOrEqual(1000 + 1e-9);
  });

  it("touches at least one edge, so nothing is left unused", () => {
    const p = build(1000, 700);
    const filledW = p.contentAcross * p.depthScale(1);
    const filledH = p.bottom - p.top;
    const slack = Math.min(1000 - filledW, 700 - filledH);
    expect(slack).toBeLessThan(1e-6);
  });

  it("puts the near end lower on screen and larger than the far end", () => {
    const p = build();
    expect(p.rowY(1)).toBeGreaterThan(p.rowY(0));
    expect(p.depthScale(1)).toBeGreaterThan(p.depthScale(0));
  });

  /**
   * The measured number this camera was fitted to. A Football Manager frame puts
   * the near half of the pitch ~17% taller on screen than the far half — the whole
   * character of the look, and the thing that breaks first if someone "improves"
   * CAMERA_DISTANCE without checking.
   */
  it("tapers by about 17%, not by a fisheye", () => {
    const p = build();
    const taper = p.depthScale(1) / p.depthScale(0);
    expect(taper).toBeGreaterThan(1.1);
    expect(taper).toBeLessThan(1.25);
  });

  it("foreshortens the length by cos(TILT)", () => {
    const p = build();
    // Compare the rendered board against the orthographic one it is drawn from.
    const rendered = (p.bottom - p.top) / (p.contentAcross * p.depthScale(0.5));
    expect(rendered / (ALONG / ACROSS)).toBeCloseTo(GROUND_SQUASH, 2);
  });

  it("holds the centre line of the pitch at the centre of the canvas", () => {
    const p = build(1000, 700);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      expect(p.project(0.5 * p.sourceW, v * p.sourceH).x).toBeCloseTo(500, 6);
    }
  });

  /**
   * The property `warpGround` is built on: a source row lands on a destination row,
   * scaled about the centre. If this ever fails, strips are the wrong primitive and
   * the warp needs a triangle mesh.
   */
  it("maps a source row to a single destination row", () => {
    const p = build();
    const sy = 0.37 * p.sourceH;
    const left = p.project(0, sy);
    const right = p.project(p.sourceW, sy);
    expect(left.y).toBeCloseTo(right.y, 9);
    expect(left.scale).toBeCloseTo(right.scale, 9);
  });

  it("keeps straight lines straight", () => {
    const p = build();
    // Three collinear source points on a diagonal, which perspective may not bend.
    const a = p.project(0, 0);
    const b = p.project(p.sourceW / 2, p.sourceH / 2);
    const c = p.project(p.sourceW, p.sourceH);
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it("reduces to the ground case at zero height", () => {
    const p = build();
    const ground = p.project(0.3 * p.sourceW, 0.7 * p.sourceH);
    const lifted = p.project(0.3 * p.sourceW, 0.7 * p.sourceH, 0);
    expect(lifted).toEqual(ground);
  });

  it("lifts a point up the frame and brings it closer", () => {
    const p = build();
    const foot = p.project(0.5 * p.sourceW, 0.7 * p.sourceH);
    const head = p.project(0.5 * p.sourceW, 0.7 * p.sourceH, 2.44);

    expect(head.y).toBeLessThan(foot.y);
    // Nearer the camera, so bigger — the two effects of height are one divisor.
    expect(head.scale).toBeGreaterThan(foot.scale);
  });

  it("keeps a post on the centre line vertical, and leans the outer ones out", () => {
    const p = build();
    const centre = p.project(0.5 * p.sourceW, 0.6 * p.sourceH, 2.44);
    expect(centre.x).toBeCloseTo(p.project(0.5 * p.sourceW, 0.6 * p.sourceH).x, 9);

    // Off-axis, rising means approaching, which spreads away from the centre.
    const footEdge = p.project(0.9 * p.sourceW, 0.6 * p.sourceH);
    const headEdge = p.project(0.9 * p.sourceW, 0.6 * p.sourceH, 2.44);
    expect(headEdge.x).toBeGreaterThan(footEdge.x);
  });

  /**
   * A crossbar 2.44 m up is lifted by 2.44 * sin(TILT) metres on screen — a tilted
   * camera sees only that much of a vertical. The rest is a second-order
   * perspective term worth under 10%, which is why both goals read the same size
   * despite standing at opposite ends of the pitch.
   */
  it("raises a crossbar by sin(TILT) of its height, at both ends", () => {
    const p = build();
    const h = 2.44;
    const expected = h * Math.sin((TILT * Math.PI) / 180);

    for (const v of [0.02, 0.98]) {
      const foot = p.project(0.5 * p.sourceW, v * p.sourceH);
      const head = p.project(0.5 * p.sourceW, v * p.sourceH, h);
      // In metres at that depth, so the two ends are comparable at all.
      const lifted = (foot.y - head.y) / p.depthScale(v);
      expect(lifted / expected).toBeGreaterThan(0.85);
      expect(lifted / expected).toBeLessThan(1.15);
    }
  });

  it("is monotonic down the board", () => {
    const p = build();
    let last = -Infinity;
    for (let i = 0; i <= 64; i++) {
      const y = p.rowY(i / 64);
      expect(y).toBeGreaterThan(last);
      last = y;
    }
  });

  it("sizes the ground layer 1:1 at the near edge and caps it", () => {
    const p = build(900, 900, 2);
    // Uncapped, the layer resolves the near edge exactly.
    expect(p.sourceScale).toBeCloseTo(p.depthScale(1) * 2, 6);
    expect(p.sourceW / p.sourceH).toBeCloseTo(ACROSS / ALONG, 2);

    const huge = projectionFor(ACROSS, ALONG, 8000, 8000, 4);
    expect(Math.max(huge.sourceW, huge.sourceH)).toBeLessThanOrEqual(4096);
  });

  it("scales the whole map with the canvas, not the shape of it", () => {
    const small = build(500, 500);
    const big = build(1000, 1000);
    expect(big.depthScale(0.3) / small.depthScale(0.3)).toBeCloseTo(2, 6);
    expect((big.bottom - big.top) / (small.bottom - small.top)).toBeCloseTo(2, 6);
  });
});

describe("tiltedAspect", () => {
  it("agrees with the fitted projection", () => {
    const p = projectionFor(ACROSS, ALONG, 4000, 4000, 1);
    const fitted = (p.contentAcross * p.depthScale(1)) / (p.bottom - p.top);
    expect(tiltedAspect(ACROSS, ALONG)).toBeCloseTo(fitted, 6);
  });

  it("is squarer than the pitch it is drawn from", () => {
    // 105 x 68 rotated is 0.65 wide; foreshortening brings it back toward 1.
    const flat = ACROSS / ALONG;
    const tilted = tiltedAspect(ACROSS, ALONG);
    expect(tilted).toBeGreaterThan(flat);
    expect(tilted).toBeGreaterThan(0.9);
    expect(tilted).toBeLessThan(1.15);
  });

  it("survives a half-pitch, which is wider than it is long", () => {
    const half = 52.5 + PITCH_PADDING * 2;
    expect(tiltedAspect(ACROSS, half)).toBeGreaterThan(1);
    expect(Number.isFinite(tiltedAspect(ACROSS, half))).toBe(true);
  });
});

describe("framingOf", () => {
  it("makes a tilted board vertical", () => {
    expect(framingOf({ half: "full", rotated: false, tilt: true }).rotated).toBe(true);
  });

  it("leaves a flat board alone", () => {
    const flat = { half: "left" as const, rotated: false };
    expect(framingOf(flat)).toBe(flat);
  });
});

describe("the camera constants", () => {
  it("is a tilt on a long lens, which is what the look is", () => {
    expect(TILT).toBeGreaterThan(20);
    expect(TILT).toBeLessThan(70);
    // Short enough to splay the near touchline would read as a fisheye.
    expect(CAMERA_DISTANCE).toBeGreaterThan(4);
  });
});
