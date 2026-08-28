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
import { DEFAULT_THEME, drawPitch, type Ctx, type PitchTheme } from "./pitch";

export const TOKEN_RADIUS = 1.1;
export const BALL_RADIUS = 0.45;

/** Resolved board state at an instant — everything the renderer needs to place things. */
export type Frame = {
  positions: Record<string, Vec2>;
  ball: Vec2;
};

/**
 * M1: a board is a single scene, so time is not yet meaningful.
 * M2 replaces the body with resolveAt(doc, t) from timeline.ts — the signature and
 * every caller stay as they are.
 */
export function frameAt(doc: BoardDoc, t: number): Frame {
  void t;
  const scene = doc.scenes[0];
  const carried = scene.carrier ? scene.positions[scene.carrier] : undefined;
  return {
    positions: scene.positions,
    ball: carried
      ? { x: carried.x + TOKEN_RADIUS + BALL_RADIUS, y: carried.y }
      : (scene.ballPos ?? { x: doc.pitch.length / 2, y: doc.pitch.width / 2 }),
  };
}

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
