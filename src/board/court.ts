/**
 * A basketball court: the floor, FIBA's markings, and the goals seen from above.
 *
 * The court is stored in board units (D113), but everything here is drawn in the
 * rulebook's metres under one scale, so each number below reads as `COURT` does.
 */

import { GRASS_SHADE_RANGE, PITCH_PADDING, lighten, type Ctx, type PitchTheme } from "./pitch";
import type { Grass } from "./types";
import { COURT, SPORTS } from "./sports";

/** Maple, a board's width of planks at a time, and the stained paint of the key. */
export const FLOOR_THEME: PitchTheme = {
  surround: "#15110d",
  grass: "#c99058",
  grassAlt: "#c28a52",
  line: "rgba(255,255,255,0.9)",
  /** A plank's width, in metres, running the length of the court. */
  stripeWidth: 0.5,
};

/** The floor a board is drawn on, shaded as its document asks — the grass slider, on wood (D89). */
export function floorTheme(doc: { grass?: Grass }): PitchTheme {
  const shade = Math.min(1, Math.max(-1, doc.grass?.shade ?? 0)) * GRASS_SHADE_RANGE;
  return {
    ...FLOOR_THEME,
    grass: lighten(FLOOR_THEME.grass, shade),
    grassAlt: lighten(FLOOR_THEME.grassAlt, shade),
  };
}

const PAINT = "rgba(120,52,20,0.32)";
/** The ring's colour, shared with the standing goal in the 3D view. */
export const RING_COLOR = "#ea580c";

export function drawCourt(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = FLOOR_THEME,
  /** False where the goals are drawn standing up instead -- the 3D view's ground layer. */
  goals = true,
): void {
  const spec = SPORTS.basketball;
  const hoop = spec.goal.kind === "hoop" ? spec.goal : null;
  const u = 1 / spec.metresPerUnit;
  const L = pitch.length / u;
  const W = pitch.width / u;
  const pad = PITCH_PADDING / u;

  ctx.save();
  ctx.scale(u, u);

  // The floor, planked along the court's length.
  ctx.fillStyle = theme.grass;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  if (theme.grassAlt !== theme.grass) {
    ctx.fillStyle = theme.grassAlt;
    for (let y = -pad; y < W + pad; y += theme.stripeWidth * 2) {
      ctx.fillRect(-pad, y, L + pad * 2, theme.stripeWidth);
    }
  }

  const cy = W / 2;
  const ringFrom = hoop ? hoop.centre / u : 1.575;

  // The key, painted, under its lines.
  ctx.fillStyle = PAINT;
  for (const dir of [1, -1] as const) {
    const base = dir === 1 ? 0 : L;
    ctx.fillRect(Math.min(base, base + dir * COURT.keyDepth), cy - COURT.keyWidth / 2, COURT.keyDepth, COURT.keyWidth);
  }

  ctx.strokeStyle = theme.line;
  ctx.fillStyle = theme.line;
  ctx.lineWidth = COURT.lineWidth;
  ctx.lineCap = "butt";

  // Boundary, halfway line and centre circle.
  ctx.strokeRect(0, 0, L, W);
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2, W);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(L / 2, cy, COURT.centreCircle, 0, Math.PI * 2);
  ctx.stroke();

  for (const dir of [1, -1] as const) {
    const base = dir === 1 ? 0 : L;
    const inward = (d: number) => base + d * dir;
    const facing = dir === 1 ? 0 : Math.PI;
    const ring = { x: inward(ringFrom), y: cy };

    // The key and its free-throw circle: solid outside the key, dashed inside it.
    ctx.strokeRect(Math.min(base, inward(COURT.keyDepth)), cy - COURT.keyWidth / 2, COURT.keyDepth, COURT.keyWidth);
    const ft = inward(COURT.keyDepth);
    ctx.beginPath();
    ctx.arc(ft, cy, COURT.freeThrowCircle, facing - Math.PI / 2, facing + Math.PI / 2);
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([0.4, 0.3]);
    ctx.beginPath();
    ctx.arc(ft, cy, COURT.freeThrowCircle, facing + Math.PI / 2, facing + (Math.PI * 3) / 2);
    ctx.stroke();
    ctx.restore();

    // The three-point line: straight in from the baseline near each sideline, then an
    // arc about the ring, meeting where the arc reaches the straight lines.
    const side = cy - COURT.threePointSide;
    const reach = Math.sqrt(COURT.threePoint ** 2 - side ** 2);
    const turn = Math.atan2(side, reach);
    ctx.beginPath();
    ctx.moveTo(base, cy - side);
    ctx.lineTo(inward(ringFrom + reach), cy - side);
    ctx.moveTo(base, cy + side);
    ctx.lineTo(inward(ringFrom + reach), cy + side);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, COURT.threePoint, facing - turn, facing + turn);
    ctx.stroke();

    // The no-charge semicircle under the ring.
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, COURT.noCharge, facing - Math.PI / 2, facing + Math.PI / 2);
    ctx.stroke();

    if (goals && hoop) {
      drawHoopFromAbove(ctx, base, dir, cy, hoop.board.line / u, hoop.board.width / u, ringFrom, hoop.radius / u);
    }
  }

  ctx.restore();
}

/**
 * A goal seen from above: the backboard edge-on, the arm to the ring, and the ring
 * itself -- in metres, inside `drawCourt`'s scale.
 */
function drawHoopFromAbove(
  ctx: Ctx,
  base: number,
  dir: 1 | -1,
  cy: number,
  boardFrom: number,
  boardWidth: number,
  ringFrom: number,
  radius: number,
): void {
  const board = base + dir * boardFrom;
  const ring = base + dir * ringFrom;

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(board, cy - boardWidth / 2);
  ctx.lineTo(board, cy + boardWidth / 2);
  ctx.stroke();

  ctx.strokeStyle = RING_COLOR;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(board, cy);
  ctx.lineTo(ring - dir * radius, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ring, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
