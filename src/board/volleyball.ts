/**
 * A volleyball court: the court in its free zone, FIVB's markings, and the net seen from
 * above.
 *
 * The board is the court AND its free zone (D113), so the lines sit three metres in from
 * the board's edge on every side. Drawn in the rulebook's metres under one scale, so each
 * number reads as `VOLLEYBALL_COURT` does.
 */

import { PITCH_PADDING, shaded, type Ctx, type PitchTheme } from "./pitch";
import { SPORTS, VOLLEYBALL_COURT as V } from "./sports";
import type { Grass } from "./types";

/** An indoor court: orange inside the lines, blue free zone around it. */
export const VOLLEYBALL_THEME: PitchTheme = {
  surround: "#0f141b",
  grass: "#d98040",
  grassAlt: "#d98040",
  line: "rgba(255,255,255,0.95)",
  stripeWidth: 1,
  apron: "#2f6aa6",
};

export const volleyballTheme = (doc: { grass?: Grass }): PitchTheme => shaded(VOLLEYBALL_THEME, doc);

/** The net's antennae: red and white, in bands. */
export const ANTENNA_COLORS = ["#dc2626", "#ffffff"] as const;

export function drawVolleyballCourt(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = VOLLEYBALL_THEME,
  /** False where the net is drawn standing up instead -- the 3D view's ground layer. */
  net = true,
): void {
  const u = 1 / SPORTS.volleyball.metresPerUnit;
  const L = pitch.length / u;
  const W = pitch.width / u;
  const pad = PITCH_PADDING / u;
  const x0 = V.freeZone;
  const y0 = V.freeZone;
  const mid = L / 2;

  ctx.save();
  ctx.scale(u, u);

  ctx.fillStyle = theme.apron ?? theme.grass;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  ctx.fillStyle = theme.grass;
  ctx.fillRect(x0, y0, V.length, V.width);

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = V.lineWidth;
  ctx.lineCap = "butt";
  ctx.strokeRect(x0, y0, V.length, V.width);

  // The centre line under the net, and an attack line three metres either side of it.
  ctx.beginPath();
  for (const x of [mid - V.attack, mid, mid + V.attack]) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + V.width);
  }
  ctx.stroke();

  // Each attack line runs on past the sidelines, broken, for 1.75 m.
  ctx.save();
  ctx.setLineDash([0.15, 0.2]);
  ctx.beginPath();
  for (const x of [mid - V.attack, mid + V.attack]) {
    ctx.moveTo(x, y0 - 1.75);
    ctx.lineTo(x, y0);
    ctx.moveTo(x, y0 + V.width);
    ctx.lineTo(x, y0 + V.width + 1.75);
  }
  ctx.stroke();
  ctx.restore();

  if (net) {
    // From above the net is its top band, post to post, with the antennae at the sidelines.
    const top = y0 - V.postsOut;
    const bottom = y0 + V.width + V.postsOut;
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    ctx.moveTo(mid + 0.06, top);
    ctx.lineTo(mid + 0.06, bottom);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(mid, top);
    ctx.lineTo(mid, bottom);
    ctx.stroke();
    ctx.fillStyle = "#e5e7eb";
    for (const y of [top, bottom]) {
      ctx.beginPath();
      ctx.arc(mid, y, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = ANTENNA_COLORS[0];
    for (const y of [y0, y0 + V.width]) {
      ctx.beginPath();
      ctx.arc(mid, y, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
