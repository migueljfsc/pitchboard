/**
 * Pitch markings at real IFAB dimensions, drawn in metre space.
 *
 * Every measurement lives in PITCH here and is never inlined at a call site.
 * Getting these exact is most of the difference between looking amateur and
 * looking right.
 */

/** Both canvas flavours share the 2D API; the renderer accepts either. */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const PITCH = {
  length: 105,
  width: 68,
  lineWidth: 0.12,
  goalWidth: 7.32,
  /** Drawn behind the goal line, not part of the playing area. */
  goalDepth: 2.0,
  sixYardDepth: 5.5,
  sixYardWidth: 18.32,
  penaltyDepth: 16.5,
  penaltyWidth: 40.32,
  penaltySpot: 11.0,
  /** Also the centre-circle radius. */
  arcRadius: 9.15,
  centreSpotRadius: 0.3,
  cornerRadius: 1.0,
} as const;

/** Player token radius at scale 1, in metres. */
export const TOKEN_RADIUS = 1.1;
/** Drawn larger than a real ball (0.11 m) so it reads at board scale. */
export const BALL_RADIUS = 0.45;

/**
 * Grass drawn beyond the touchlines and goal lines, in metres. Deep enough to
 * seat a team name behind each goal. fitViewport and the half-view clip both
 * read it, so the band is never cut off.
 */
export const PITCH_PADDING = 5;

export const MIN_TOKEN_SCALE = 0.5;
export const MAX_TOKEN_SCALE = 2.5;

/**
 * Token sizing is per-document, so hit-testing, the ball's carry offset and the
 * renderer all have to agree. These are the single source of that agreement —
 * never multiply TOKEN_RADIUS by hand at a call site.
 */
export const tokenScaleOf = (doc: { tokenScale?: number }): number => doc.tokenScale ?? 1;
export const tokenRadius = (doc: { tokenScale?: number }): number =>
  TOKEN_RADIUS * tokenScaleOf(doc);
export const ballRadius = (doc: { tokenScale?: number }): number =>
  BALL_RADIUS * tokenScaleOf(doc);

export type PitchTheme = {
  /** Behind and around the pitch, out to the canvas edge. */
  surround: string;
  grass: string;
  /** Alternate mow stripe. Set equal to `grass` to disable striping. */
  grassAlt: string;
  line: string;
  /** Metres per mow stripe. */
  stripeWidth: number;
};

export const DEFAULT_THEME: PitchTheme = {
  surround: "#0d1512",
  grass: "#1c6b3c",
  grassAlt: "#1a6338",
  line: "rgba(255,255,255,0.85)",
  stripeWidth: 105 / 14,
};

/**
 * Draw the surface and all markings. Assumes the caller has already applied the
 * metre-space transform, so all coordinates below are metres.
 */
export function drawPitch(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = DEFAULT_THEME,
): void {
  const { length: L, width: W } = pitch;
  const P = PITCH;

  // Surface, with a margin band so the pitch is not flush to the canvas edge.
  const pad = PITCH_PADDING;
  ctx.fillStyle = theme.grass;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);

  if (theme.grassAlt !== theme.grass) {
    ctx.fillStyle = theme.grassAlt;
    for (let x = 0; x < L; x += theme.stripeWidth * 2) {
      ctx.fillRect(x, -pad, Math.min(theme.stripeWidth, L - x), W + pad * 2);
    }
  }

  ctx.strokeStyle = theme.line;
  ctx.fillStyle = theme.line;
  ctx.lineWidth = P.lineWidth;
  ctx.lineCap = "butt";

  // Touchlines and goal lines.
  ctx.strokeRect(0, 0, L, W);

  // Halfway line and centre circle.
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2, W);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(L / 2, W / 2, P.arcRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(L / 2, W / 2, P.centreSpotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Each end. `dir` is +1 for the left goal, -1 for the right.
  for (const dir of [1, -1] as const) {
    const goalLine = dir === 1 ? 0 : L;
    const cy = W / 2;
    const inward = (d: number) => goalLine + d * dir;

    // Penalty area and six-yard box.
    ctx.strokeRect(
      Math.min(goalLine, inward(P.penaltyDepth)),
      cy - P.penaltyWidth / 2,
      P.penaltyDepth,
      P.penaltyWidth,
    );
    ctx.strokeRect(
      Math.min(goalLine, inward(P.sixYardDepth)),
      cy - P.sixYardWidth / 2,
      P.sixYardDepth,
      P.sixYardWidth,
    );

    // Penalty spot.
    ctx.beginPath();
    ctx.arc(inward(P.penaltySpot), cy, P.centreSpotRadius, 0, Math.PI * 2);
    ctx.fill();

    // Penalty arc: the part of a 9.15 m circle centred on the SPOT that falls
    // outside the penalty area. Not an arc drawn on the box edge — that is the
    // version people get wrong.
    const half = Math.acos((P.penaltyDepth - P.penaltySpot) / P.arcRadius);
    const facing = dir === 1 ? 0 : Math.PI;
    ctx.beginPath();
    ctx.arc(inward(P.penaltySpot), cy, P.arcRadius, facing - half, facing + half);
    ctx.stroke();

    // Goal, drawn behind the line.
    ctx.beginPath();
    ctx.rect(
      dir === 1 ? goalLine - P.goalDepth : goalLine,
      cy - P.goalWidth / 2,
      P.goalDepth,
      P.goalWidth,
    );
    ctx.stroke();

    // Corner arcs, quarter circles opening into the pitch.
    for (const corner of [0, W] as const) {
      const start = dir === 1 ? (corner === 0 ? 0 : -Math.PI / 2) : corner === 0 ? Math.PI / 2 : Math.PI;
      ctx.beginPath();
      ctx.arc(goalLine, corner, P.cornerRadius, start, start + Math.PI / 2);
      ctx.stroke();
    }
  }
}
