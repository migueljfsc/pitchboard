import { describe, expect, it } from "vitest";
import {
  NO_SCREEN_ZOOM,
  cameraAt,
  cameraFromZoom,
  cameraTransform,
  screenMapping,
  unzoomPoint,
} from "./camera";
import { resolveAt } from "./timeline";
import { addSceneAfter, sceneStartSeconds, setSceneCamera } from "./scenes";
import { boardDocSchema } from "./schema";
import { drawBoard } from "./render";
import { createRecordingCtx } from "./recording-ctx";
import { fitViewport } from "./geometry";
import { exportView } from "@/export/frame";
import { createBoardDoc } from "@/formations";

const W = 1200;
const H = 800;
const flat = { half: "full" as const, rotated: false };
const base = addSceneAfter(createBoardDoc(), 0);
const box = { at: { x: 94, y: 34 }, zoom: 3 };
const zoomed = setSceneCamera(base, 1, box);
const mapping = screenMapping(zoomed, flat, W, H, 1);

describe("scene cameras", () => {
  it("are stored only when they zoom, and validate", () => {
    expect(zoomed.scenes[1].camera).toEqual(box);
    expect(setSceneCamera(zoomed, 1, null).scenes[1].camera).toBeUndefined();
    expect(setSceneCamera(base, 1, { at: box.at, zoom: 1 }).scenes[1].camera).toBeUndefined();
    expect(boardDocSchema.safeParse(zoomed).success).toBe(true);
    const tooClose = structuredClone(zoomed);
    tooClose.scenes[1].camera = { at: box.at, zoom: 40 };
    expect(boardDocSchema.safeParse(tooClose).success).toBe(false);
  });

  it("leave the board alone where no scene has one", () => {
    const r = resolveAt(base, sceneStartSeconds(base, 1));
    expect(cameraTransform(r, base, W, H, screenMapping(base, flat, W, H, 1))).toEqual(NO_SCREEN_ZOOM);
  });

  it("put the scene's point in the middle of the screen at its zoom", () => {
    const r = resolveAt(zoomed, sceneStartSeconds(zoomed, 1));
    const z = cameraTransform(r, zoomed, W, H, mapping);
    expect(z.z).toBe(3);
    const s = mapping.toScreen(box.at);
    expect(z.z * s.x + z.x).toBeCloseTo(W / 2, 6);
    expect(z.z * s.y + z.y).toBeCloseTo(H / 2, 6);
  });

  it("move smoothly from the whole board to the close-up", () => {
    const start = sceneStartSeconds(zoomed, 1);
    const travel = zoomed.scenes[1].transitionMs / 1000;
    const half = resolveAt(zoomed, start - travel / 2);
    const home = mapping.fromScreen({ x: W / 2, y: H / 2 });
    const mid = cameraAt(half, home)!;
    // Halfway in time is halfway in SCALE — √3 between 1 and 3 — so the zoom grows
    // at a steady rate on screen.
    expect(mid.zoom).toBeCloseTo(Math.sqrt(3), 6);
    // Between the two points, nearer the wide one, which leads.
    expect(mid.at.x).toBeGreaterThan(home.x);
    expect(mid.at.x).toBeLessThan((home.x + box.at.x) / 2);
  });

  it("ease in flow mode too, rather than crawling at a steady pace", () => {
    const flowing = { ...zoomed, flow: { speed: 10, endHoldMs: 500 } };
    const start = sceneStartSeconds(flowing, 1);
    const early = resolveAt(flowing, start * 0.3);
    const home = mapping.fromScreen({ x: W / 2, y: H / 2 });
    // Eased: barely moved a little way in, where linear would be well under way.
    expect(early.moving).toBe(true);
    const z = cameraAt(early, home)!.zoom;
    expect(z).toBeLessThan(Math.pow(3, early.u));
  });

  it("round-trip: a working zoom saved as a camera shows the same view", () => {
    const zoom = { z: 2.5, x: -900, y: -500 };
    const camera = cameraFromZoom(zoom, W, H, mapping);
    const withIt = setSceneCamera(base, 1, camera);
    const r = resolveAt(withIt, sceneStartSeconds(withIt, 1));
    const again = cameraTransform(r, withIt, W, H, mapping);
    expect(again.z).toBeCloseTo(zoom.z, 6);
    expect(again.x).toBeCloseTo(zoom.x, 6);
    expect(again.y).toBeCloseTo(zoom.y, 6);
    const p = { x: 300, y: 200 };
    expect(unzoomPoint(p, again).x).toBeCloseTo(unzoomPoint(p, zoom).x, 6);
  });

  it("are never made pointing nowhere", () => {
    // A board not yet measured has no middle; the camera is refused, not stored as NaN.
    expect(cameraFromZoom({ z: 3, x: 0, y: 0 }, 0, 0, screenMapping(base, flat, 0, 0, 1))).toBeNull();
    const nan = { at: { x: NaN, y: 10 }, zoom: 3 };
    expect(setSceneCamera(base, 1, nan)).toBe(base);
  });

  it("are drawn through by an export, and not by the editor unless asked", () => {
    const t = sceneStartSeconds(zoomed, 1);
    const view = { ...fitViewport(W, H, 105, 68), width: W, height: H, interactive: false };
    const log = (sceneCamera: boolean) => {
      const r = createRecordingCtx();
      drawBoard(r.ctx, zoomed, t, { ...view, sceneCamera });
      return r.log;
    };
    expect(log(true).some((e) => e.startsWith("transform(3,"))).toBe(true);
    expect(log(false).some((e) => e.startsWith("transform(3,"))).toBe(false);
    expect(exportView(zoomed, { width: W, height: H }).sceneCamera).toBe(true);
  });
});
