/**
 * drawBoard — the one renderer.
 *
 * PURE. No DOM, no React, no Date.now(), no Math.random(), no module-level mutable
 * state. Given (doc, t, view) it emits the same pixels in any thread. The editor
 * calls it on a visible canvas; the export worker calls it on an OffscreenCanvas at
 * 1920x1080. That is what makes preview/export divergence structurally impossible,
 * so if you need a value in here, put it in BoardDoc or RenderView.
 *
 * Everything inside the transform block is in pitch metres, including line widths
 * and font sizes.
 */

import type { BoardDoc, RenderView, Vec2 } from "./types";
import { BALL_ID } from "./types";
import {
  BALL_RADIUS,
  DEFAULT_THEME,
  TOKEN_RADIUS,
  drawPitch,
  type Ctx,
  type PitchTheme,
} from "./pitch";
import { displayCurve, frameAt, transitionInto, type Frame } from "./timeline";
import { buildArcTable, cubicAt, cubicTangent, reparameterise, type Bezier } from "./geometry";

export { TOKEN_RADIUS, BALL_RADIUS };
export type { Frame };

/** Steps used to stroke a curved path. Purely cosmetic; the maths is exact. */
const PATH_STEPS = 24;

export function drawBoard(
  ctx: Ctx,
  doc: BoardDoc,
  t: number,
  view: RenderView,
  theme: PitchTheme = DEFAULT_THEME,
): void {
  const frame = frameAt(doc, t);

  ctx.save();

  // Surround first, so one call yields a complete frame.
  ctx.fillStyle = theme.surround;
  ctx.fillRect(0, 0, view.width, view.height);

  // Compose with whatever transform the caller set (the editor sets a DPR scale),
  // then work in metres from here down.
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  drawPitch(ctx, doc.pitch, theme);
  drawPaths(ctx, doc, frame, view);

  for (const team of doc.teams) {
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (!p) continue;
      drawToken(ctx, p, player.number, player.label, team.color, team.textColor, {
        selected: view.selection?.has(player.id) ?? false,
        hovered: view.interactive && view.hover === player.id,
      });
    }
  }

  drawBall(ctx, frame.ball, {
    selected: view.selection?.has(BALL_ID) ?? false,
    hovered: view.interactive && view.hover === BALL_ID,
  });

  if (view.interactive && view.marquee) {
    drawMarquee(ctx, view.marquee.a, view.marquee.b);
  }

  ctx.restore();
}

// ---------------------------------------------------------------- paths

/**
 * Motion paths for the transition into the current scene.
 *
 * Shown while moving, and for a selected entity even at rest so its run can be
 * edited. Suppressed entirely for export unless the animation is under way.
 */
function drawPaths(ctx: Ctx, doc: BoardDoc, frame: Frame, view: RenderView): void {
  const r = frame.resolved;

  // While the animation runs, show every run in flight.
  if (r.moving) {
    for (const team of doc.teams) {
      for (const player of team.players) {
        const b = displayCurve(player.id, r);
        if (b) drawPath(ctx, b, team.color, false);
      }
    }
    return;
  }

  // At rest, the editor still shows the selected players' runs into the scene
  // being edited, so a curve can be shaped without scrubbing to find it.
  if (!view.interactive || view.editScene === undefined) return;
  const edit = transitionInto(doc, view.editScene);
  if (!edit) return;

  for (const team of doc.teams) {
    for (const player of team.players) {
      if (!view.selection?.has(player.id)) continue;
      const b = displayCurve(player.id, edit);
      if (b) drawPath(ctx, b, team.color, true);
    }
  }
}

function drawPath(ctx: Ctx, b: Bezier, color: string, withHandles: boolean): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.28;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.75;

  // Stop short of the destination so the arrowhead is not buried in the token.
  const table = buildArcTable(b);
  const trim = table.total > TOKEN_RADIUS * 2 ? 1 - TOKEN_RADIUS / table.total : 1;

  ctx.beginPath();
  for (let i = 0; i <= PATH_STEPS; i++) {
    const p = cubicAt(b, reparameterise(table, (i / PATH_STEPS) * trim));
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  const tip = cubicAt(b, reparameterise(table, trim));
  drawArrowhead(ctx, tip, cubicTangent(b, reparameterise(table, trim)), color);
  ctx.globalAlpha = 1;

  if (withHandles) drawHandles(ctx, b);
}

function drawArrowhead(ctx: Ctx, tip: Vec2, dir: Vec2, color: string): void {
  const len = 1.5;
  const half = 0.7;
  const nx = -dir.y;
  const ny = dir.x;
  const baseX = tip.x - dir.x * len;
  const baseY = tip.y - dir.y * len;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(baseX + nx * half, baseY + ny * half);
  ctx.lineTo(baseX - nx * half, baseY - ny * half);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Bezier control points, shown only while the entity is selected. */
function drawHandles(ctx: Ctx, b: Bezier): void {
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(251,191,36,0.5)";
  ctx.lineWidth = 0.08;
  ctx.setLineDash([0.4, 0.3]);
  ctx.beginPath();
  ctx.moveTo(b.p0.x, b.p0.y);
  ctx.lineTo(b.c1.x, b.c1.y);
  ctx.moveTo(b.p1.x, b.p1.y);
  ctx.lineTo(b.c2.x, b.c2.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const c of [b.c1, b.c2]) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 0.08;
    ctx.stroke();
  }
}

export const HANDLE_RADIUS = 0.55;

// ---------------------------------------------------------------- entities

type TokenState = { selected: boolean; hovered: boolean };

function drawToken(
  ctx: Ctx,
  p: Vec2,
  number: number,
  label: string,
  color: string,
  textColor: string,
  state: TokenState,
): void {
  // Selection and hover rings sit outside the token so they never cover the number.
  if (state.selected || state.hovered) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, TOKEN_RADIUS + 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = state.selected ? 0.26 : 0.18;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, TOKEN_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.1;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = "600 1.25px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), p.x, p.y + 0.05);

  if (label) {
    ctx.font = "500 1px Inter, system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "top";
    // A dark rim keeps the label readable over both mow stripes and white lines.
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 0.22;
    ctx.lineJoin = "round";
    ctx.strokeText(label, p.x, p.y + TOKEN_RADIUS + 0.3);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, p.x, p.y + TOKEN_RADIUS + 0.3);
  }
}

function drawBall(ctx: Ctx, p: Vec2, state: TokenState): void {
  if (state.selected || state.hovered) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, BALL_RADIUS + 0.3, 0, Math.PI * 2);
    ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.16;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 0.1;
  ctx.stroke();
}

function drawMarquee(ctx: Ctx, a: Vec2, b: Vec2): void {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);

  ctx.fillStyle = "rgba(251,191,36,0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 0.12;
  ctx.setLineDash([0.6, 0.4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}
