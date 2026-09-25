/**
 * The scenes' cameras: where each scene looks, and how the view moves between them.
 *
 * PURE, like the renderer: given the document, an instant and a view it answers the
 * same in any thread. One definition, used by `drawBoard` to draw through the camera
 * and by the editor to turn a pointer back into a place on the pitch — two answers
 * to "where is this on screen" would drift the way preview and export would.
 */

import type { BoardDoc, PitchHalf, SceneCamera, Vec2, Viewport } from "./types";
import { easeInOutCubic, fitViewport, toPitch, toScreen } from "./geometry";
import { cameraFor, framingOf, projectPitch, unprojectPitch } from "./projection";
import type { Resolved } from "./timeline";

/** The furthest a scene may zoom in. */
export const MAX_SCENE_ZOOM = 6;

/**
 * A zoom as a screen-space transform: scale by `z`, then move by `x`, `y` CSS
 * pixels. `{ z: 1, x: 0, y: 0 }` leaves the board alone.
 */
export type ScreenZoom = { z: number; x: number; y: number };

export const NO_SCREEN_ZOOM: ScreenZoom = { z: 1, x: 0, y: 0 };

/** Between a place on the pitch and a place on screen, for one framing of the board. */
export type ScreenMapping = { toScreen: (p: Vec2) => Vec2; fromScreen: (s: Vec2) => Vec2 };

/**
 * How the board maps to the screen before any zoom — flat through the viewport,
 * tilted through the one 3D camera (D34).
 */
export function screenMapping(
  doc: BoardDoc,
  view: { half: PitchHalf; rotated: boolean; tilt?: boolean },
  width: number,
  height: number,
  deviceScale: number,
): ScreenMapping {
  const framing = framingOf({ half: view.half, rotated: view.rotated, tilt: view.tilt });
  if (framing.tilt) {
    const cam = cameraFor(doc.pitch, view.half, width, height, deviceScale);
    return {
      toScreen: (p) => projectPitch(p, cam),
      fromScreen: (s) => unprojectPitch(s, cam),
    };
  }
  const viewport: Viewport = fitViewport(width, height, doc.pitch.length, doc.pitch.width, framing);
  return { toScreen: (p) => toScreen(p, viewport), fromScreen: (s) => toPitch(s, viewport) };
}

/**
 * Where the camera is at this instant, or null when neither scene around it has one.
 *
 * Moving between two scenes it eases from one camera to the next, so the view
 * arrives as the players do. A scene with no camera is the whole board — `home`,
 * the point at the middle of the screen, at zoom 1 — so a move into or out of a
 * close-up is a smooth pull back rather than a cut.
 *
 * Always eased, flow mode included: a camera move that starts and stops at full
 * speed reads as sluggish and then abrupt, and flow's steady pace is about the
 * players (D27), not the lens. The zoom is interpolated geometrically, so it grows
 * at a steady rate on screen instead of racing and then crawling; the point is
 * weighted by the zoom so that what is being framed stays steady while it does.
 */
export function cameraAt(r: Resolved, home: Vec2): SceneCamera | null {
  const from = r.from.camera;
  const to = r.to.camera;
  if (!from && !to) return null;
  const whole: SceneCamera = { at: home, zoom: 1 };
  if (!r.moving) return to ?? whole;
  const a = from ?? whole;
  const b = to ?? whole;
  const u = easeInOutCubic(r.u);
  const zoom = a.zoom * Math.pow(b.zoom / a.zoom, u);
  // Each end's point counts in proportion to how far out it is: the wider view
  // leads, so a zoom in closes on its target rather than swinging past it.
  const wa = (1 - u) / a.zoom;
  const wb = u / b.zoom;
  const at = {
    x: (a.at.x * wa + b.at.x * wb) / (wa + wb),
    y: (a.at.y * wa + b.at.y * wb) / (wa + wb),
  };
  return { at, zoom };
}

/**
 * The screen transform that puts the camera's point in the middle of the screen at
 * its zoom. Identity when there is no camera.
 */
export function cameraTransform(
  r: Resolved,
  doc: BoardDoc,
  width: number,
  height: number,
  mapping: ScreenMapping,
): ScreenZoom {
  const centre = { x: width / 2, y: height / 2 };
  const home = mapping.fromScreen(centre);
  const middle = Number.isFinite(home.x)
    ? home
    : { x: doc.pitch.length / 2, y: doc.pitch.width / 2 };
  const camera = cameraAt(r, middle);
  if (!camera) return NO_SCREEN_ZOOM;
  const s = mapping.toScreen(camera.at);
  const z = Math.min(Math.max(camera.zoom, 1), MAX_SCENE_ZOOM);
  return { z, x: centre.x - z * s.x, y: centre.y - z * s.y };
}

/** A point on screen back through a zoom, into the space the board was drawn in. */
export const unzoomPoint = (at: Vec2, zoom: ScreenZoom): Vec2 => ({
  x: (at.x - zoom.x) / zoom.z,
  y: (at.y - zoom.y) / zoom.z,
});

/**
 * The camera that shows what a screen zoom shows: the point at the middle of the
 * screen, at that zoom. What "Save as this scene's zoom" stores.
 */
export function cameraFromZoom(
  zoom: ScreenZoom,
  width: number,
  height: number,
  mapping: ScreenMapping,
): SceneCamera | null {
  // A board not yet measured, or a point above a 3D horizon, has no place on the
  // pitch under the middle of the screen — and a camera pointing at NaN is a
  // document no validator will accept, so nothing is made at all.
  if (!(width > 0 && height > 0)) return null;
  const at = mapping.fromScreen(unzoomPoint({ x: width / 2, y: height / 2 }, zoom));
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(zoom.z)) return null;
  return { at, zoom: Math.min(Math.max(zoom.z, 1), MAX_SCENE_ZOOM) };
}

/**
 * The screen zoom that shows what a camera shows — `cameraFromZoom` run backwards.
 * What the editor jumps to when a scene with a locked zoom is selected.
 */
export function zoomFromCamera(
  camera: SceneCamera,
  width: number,
  height: number,
  mapping: ScreenMapping,
): ScreenZoom {
  const s = mapping.toScreen(camera.at);
  const z = Math.min(Math.max(camera.zoom, 1), MAX_SCENE_ZOOM);
  return { z, x: width / 2 - z * s.x, y: height / 2 - z * s.y };
}

/** Does a screen zoom show what this camera shows, to within a rounding? */
export function zoomMatchesCamera(
  zoom: ScreenZoom,
  camera: SceneCamera | undefined,
  width: number,
  height: number,
  mapping: ScreenMapping,
): boolean {
  if (!camera) return zoom.z <= 1.001;
  const expected = zoomFromCamera(camera, width, height, mapping);
  return (
    Math.abs(expected.z - zoom.z) < 1e-3 &&
    Math.abs(expected.x - zoom.x) < 0.5 &&
    Math.abs(expected.y - zoom.y) < 0.5
  );
}
