import { describe, expect, it } from "vitest";
import { drawBoard } from "./render";
import { DEFAULT_THEME, lighten, themeFor } from "./pitch";
import { createRecordingCtx } from "./recording-ctx";
import { fitViewport } from "./geometry";
import { setKeeper } from "./players";
import { setCarrier } from "./scenes";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import type { BoardDoc, RenderView } from "./types";

const W = 1200;
const H = 800;

function view(doc: BoardDoc): RenderView {
  return {
    ...fitViewport(W, H, doc.pitch.length, doc.pitch.width),
    width: W,
    height: H,
    interactive: false,
  };
}

function log(doc: BoardDoc): string[] {
  const r = createRecordingCtx();
  drawBoard(r.ctx, doc, 0, view(doc));
  return r.log;
}

describe("the grass (D89)", () => {
  it("is the board it always was until somebody changes it", () => {
    expect(themeFor({})).toEqual({ ...DEFAULT_THEME, natural: false });
  });

  it("darkens and lightens the green without turning it another colour", () => {
    const dark = themeFor({ grass: { shade: -1 } }).grass;
    const light = themeFor({ grass: { shade: 1 } }).grass;
    const lum = (hex: string) => parseInt(hex.slice(3, 5), 16);
    expect(lum(dark)).toBeLessThan(lum(DEFAULT_THEME.grass));
    expect(lum(light)).toBeGreaterThan(lum(DEFAULT_THEME.grass));
    for (const hex of [dark, light]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it("leaves a colour alone when asked to move it by nothing", () => {
    expect(lighten("#1c6b3c", 0)).toBe("#1c6b3c");
  });

  it("falls back to the plain stripes where there is no OffscreenCanvas to draw turf on", () => {
    expect(typeof OffscreenCanvas).toBe("undefined");
    const doc = { ...createBoardDoc(), grass: { texture: "natural" as const } };
    expect(log(doc)).toEqual(log(createBoardDoc()));
  });

  it("is refused outside its range", () => {
    const doc = { ...createBoardDoc(), grass: { shade: 2 } };
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
    expect(boardDocSchema.safeParse({ ...doc, grass: { shade: -0.4 } }).success).toBe(true);
  });
});

describe("the keeper's kit (D90)", () => {
  it("paints the keeper in his own colour and nobody else", () => {
    const doc = setKeeper(createBoardDoc(), "home-9");
    const keeper = doc.teams[0].keeper!.color;
    const fills = log(doc).filter((e) => e === `fillStyle="${keeper}"`);
    expect(fills.length).toBeGreaterThan(0);
    expect(log(createBoardDoc()).filter((e) => e === `fillStyle="${keeper}"`)).toHaveLength(0);
  });
});

describe("the ball (D89)", () => {
  const withBall = () => setCarrier(createBoardDoc(), 0, "home-9");

  it("is drawn the same way every time, turned by where it is", () => {
    const doc = withBall();
    expect(log(doc)).toEqual(log(doc));
    const moved = setCarrier(doc, 0, "home-10");
    const panels = (l: string[]) => l.filter((e) => e.startsWith("moveTo(")).slice(-10);
    expect(panels(log(moved))).not.toEqual(panels(log(doc)));
  });

  it("casts a shadow on the flat board", () => {
    const shadow = (l: string[]) => l.filter((e) => e === 'fillStyle="rgba(0,0,0,0.28)"').length;
    expect(shadow(log(withBall()))).toBe(1);
    expect(shadow(log(createBoardDoc()))).toBe(0);
  });
});
