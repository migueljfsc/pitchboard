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
  PITCH_PADDING,
  TEAM_NAME_OFFSET,
  TOKEN_RADIUS,
  ballRadius,
  drawPitch,
  tokenRadius,
  tokenScaleOf,
  type Ctx,
  type PitchTheme,
} from "./pitch";
import { displayCurve, frameAt, transitionInto, type Frame } from "./timeline";
import { linkColor, linkGeometry, type LinkGeometry } from "./links";
import {
  buildArcTable,
  halfRange,
  cubicAt,
  cubicTangent,
  reparameterise,
  viewMatrix,
  type Bezier,
} from "./geometry";

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
  // then work in metres from here down. One matrix covers upright and rotated.
  ctx.transform(...viewMatrix(view));

  // Clip to the crop, so a half view shows half a pitch rather than the whole
  // one nudged sideways. Without this the neighbouring half simply spills into
  // whatever canvas width is left over.
  if (view.half !== "full") {
    const [x0, x1] = halfRange(view.half, doc.pitch.length);
    const pad = PITCH_PADDING;
    ctx.beginPath();
    ctx.rect(
      view.half === "left" ? x0 - pad : x0,
      -pad,
      x1 - x0 + pad,
      doc.pitch.width + pad * 2,
    );
    ctx.clip();
  }

  drawPitch(ctx, doc.pitch, theme);
  drawTeamNames(ctx, doc, view.rotated);
  // Links sit under the tokens so a connector never covers a shirt number.
  drawLinks(ctx, doc, frame, view.rotated);
  drawPaths(ctx, doc, frame, view);

  const scale = tokenScaleOf(doc);

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (!p) continue;
      drawToken(ctx, p, player.number, player.label, team.color, team.textColor, {
        selected: view.selection?.has(player.id) ?? false,
        hovered: view.interactive && view.hover === player.id,
        rotated: view.rotated,
        scale,
      });
    }
  }

  drawBall(ctx, frame.ball, ballRadius(doc), {
    selected: view.selection?.has(BALL_ID) ?? false,
    hovered: view.interactive && view.hover === BALL_ID,
  });

  if (view.interactive && view.marquee) {
    drawMarquee(ctx, view.marquee.a, view.marquee.b);
  }

  ctx.restore();
}

/**
 * Each team's name in the grass behind the goal it defends.
 *
 * teams[0] defends x=0 and teams[1] defends x=length — the same convention
 * facingOf uses, and how createBoardDoc lays a board out.
 *
 * The name always runs PARALLEL to the goal line — the only orientation that fits
 * the band behind the goal. On a horizontal board the two are mirrored so they
 * face each other across the pitch, like signage at either end of a ground. On a
 * vertical board both stay upright, because mirroring there would leave one of
 * them upside down.
 */
function drawTeamNames(ctx: Ctx, doc: BoardDoc, rotated: boolean): void {
  doc.teams.forEach((team, i) => {
    const name = team.name.trim();
    if (team.hidden || !name) return;

    const at = {
      x: i === 0 ? -TEAM_NAME_OFFSET : doc.pitch.length + TEAM_NAME_OFFSET,
      y: doc.pitch.width / 2,
    };

    ctx.save();
    ctx.translate(at.x, at.y);
    // Vertical: the outer matrix already turns -90 degrees, so +90 nets to zero
    // and both names sit straight across their goal.
    // Horizontal: a quarter turn each way, mirroring the pair.
    ctx.rotate(rotated ? Math.PI / 2 : i === 0 ? -Math.PI / 2 : Math.PI / 2);

    ctx.font = "700 2.1px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.5;
    ctx.strokeText(name, 0, 0);
    // Always white: a dark kit colour disappears into the grass here.
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(name, 0, 0);
    ctx.restore();
  });
}

/**
 * Draw text upright regardless of board rotation.
 *
 * The metre-space transform carries a -90 degree turn when the pitch is vertical,
 * which would stand every shirt number on its side. Counter-rotating leaves the
 * local axes aligned with the screen, so `draw` can position relative to the
 * anchor exactly as it would on an upright board.
 */
function upright(ctx: Ctx, at: Vec2, rotated: boolean, draw: () => void): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  if (rotated) ctx.rotate(Math.PI / 2);
  draw();
  ctx.restore();
}

// ---------------------------------------------------------------- links

/** Ids of players on hidden teams. Shared by rendering and hit-testing. */
export function concealedPlayers(doc: BoardDoc): Set<string> {
  const out = new Set<string>();
  for (const team of doc.teams) {
    if (team.hidden) for (const p of team.players) out.add(p.id);
  }
  return out;
}

/**
 * Connectors between grouped players, recomputed from their current interpolated
 * positions so the shape deforms live as the animation runs.
 */
function drawLinks(ctx: Ctx, doc: BoardDoc, frame: Frame, rotated: boolean): void {
  const concealed = concealedPlayers(doc);

  for (const link of doc.links) {
    if (link.hidden) continue;
    // A link whose players are all on a hidden team goes with them.
    if (link.members.every((m) => concealed.has(m))) continue;
    const g = linkGeometry(link, frame.resolved, doc);
    if (!g) continue;
    const color = linkColor(doc, link);

    ctx.beginPath();
    ctx.moveTo(g.points[0].x, g.points[0].y);
    for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
    if (g.closed) ctx.closePath();

    if (link.style === "filled") {
      ctx.fillStyle = withAlpha(color, 0.22);
      ctx.fill();
    }

    // A dark under-stroke first: a blue or black kit colour is nearly invisible
    // against the grass on its own.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.52;
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.36;
    ctx.stroke();

    if (link.showDistances) drawDistances(ctx, g, rotated);
  }
}

/** Edge lengths in metres, drawn upright — rotating them with the edge reads badly. */
function drawDistances(ctx: Ctx, g: LinkGeometry, rotated: boolean): void {
  for (const edge of g.edges) {
    upright(ctx, edge.mid, rotated, () => {
      const text = `${edge.metres.toFixed(1)}m`;
      ctx.font = "600 1.05px Inter, system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 0.5;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, 0, 0);
    });
  }
}

/**
 * Apply alpha to a colour. Handles the #rgb and #rrggbb the palette uses; anything
 * else is passed through, losing the alpha but never throwing.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;

  const body = hex.slice(1);
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  if (full.length !== 6) return hex;

  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------------------------------------------------------------- paths

/**
 * Motion paths for the transition into the current scene.
 *
 * Shown while moving, and for a selected entity even at rest so its run can be
 * edited. Suppressed entirely for export unless the animation is under way.
 */
function drawPaths(ctx: Ctx, doc: BoardDoc, frame: Frame, view: RenderView): void {
  const clear = tokenRadius(doc);
  const r = frame.resolved;

  // While the animation runs, show every run in flight.
  if (r.moving) {
    for (const team of doc.teams) {
      if (team.hidden) continue;
      for (const player of team.players) {
        const b = displayCurve(player.id, r);
        if (b) drawPath(ctx, b, team.color, false, clear);
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
    if (team.hidden) continue;
    for (const player of team.players) {
      if (!view.selection?.has(player.id)) continue;
      const b = displayCurve(player.id, edit);
      if (b) drawPath(ctx, b, team.color, true, clear);
    }
  }
}

function drawPath(ctx: Ctx, b: Bezier, color: string, withHandles: boolean, clear: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.28;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.75;

  // Stop short of the destination so the arrowhead is not buried in the token.
  const table = buildArcTable(b);
  const trim = table.total > clear * 2 ? 1 - clear / table.total : 1;

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

type TokenState = { selected: boolean; hovered: boolean; rotated?: boolean; scale?: number };

function drawToken(
  ctx: Ctx,
  p: Vec2,
  number: number,
  label: string,
  color: string,
  textColor: string,
  state: TokenState,
): void {
  // Rings, strokes and type all scale with the token, so a bigger board is the
  // same drawing at a larger size rather than fat tokens with tiny numbers.
  const k = state.scale ?? 1;
  const radius = TOKEN_RADIUS * k;

  // Selection and hover rings sit outside the token so they never cover the number.
  if (state.selected || state.hovered) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 0.42 * k, 0, Math.PI * 2);
    ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = (state.selected ? 0.26 : 0.18) * k;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.1 * k;
  ctx.stroke();

  // Text is anchored to the token but never turns with the board.
  upright(ctx, p, state.rotated ?? false, () => {
    ctx.fillStyle = textColor;
    ctx.font = `600 ${1.25 * k}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), 0, 0.05 * k);

    if (label) {
      ctx.font = `500 ${1 * k}px Inter, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "top";
      // A dark rim keeps the label readable over both mow stripes and white lines.
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 0.22 * k;
      ctx.lineJoin = "round";
      ctx.strokeText(label, 0, radius + 0.3 * k);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, 0, radius + 0.3 * k);
    }
  });
}

function drawBall(ctx: Ctx, p: Vec2, radius: number, state: TokenState): void {
  const k = radius / BALL_RADIUS;
  if (state.selected || state.hovered) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 0.3 * k, 0, Math.PI * 2);
    ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.16 * k;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
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
