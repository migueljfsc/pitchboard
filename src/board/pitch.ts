/**
 * Pitch markings at real IFAB dimensions, drawn in metre space.
 *
 * Every measurement lives in PITCH here and is never inlined at a call site.
 * Getting these exact is most of the difference between looking amateur and
 * looking right.
 */

import type { Grass, TurfCache } from "./types";

/** Both canvas flavours share the 2D API; the renderer accepts either. */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const PITCH = {
  length: 105,
  width: 68,
  lineWidth: 0.12,
  goalWidth: 7.32,
  /** Drawn behind the goal line, not part of the playing area. */
  goalDepth: 2.0,
  /** Only the 3D view has anywhere to put this; the flat board draws a footprint. */
  goalHeight: 2.44,
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
export const PITCH_PADDING = 6.5;

/**
 * Distance from the goal line to the centre of the team name, in metres. Clear of
 * the 2 m goal with room to breathe, and PITCH_PADDING leaves margin beyond it.
 */
export const TEAM_NAME_OFFSET = 4.3;

export const MIN_TOKEN_SCALE = 0.5;
export const MAX_TOKEN_SCALE = 2.5;

/**
 * Token sizing is per-document, so hit-testing, the ball's carry offset and the
 * renderer all have to agree. These are the single source of that agreement —
 * never multiply TOKEN_RADIUS by hand at a call site.
 */
/**
 * Size a board uses when it has not been told otherwise. Tokens at 1x are
 * accurate to a player's footprint and too small to read a shirt number on, so
 * the readable size is the default and 1x is available for anyone who wants the
 * literal one.
 */
export const DEFAULT_TOKEN_SCALE = 1.25;

export const tokenScaleOf = (doc: { tokenScale?: number }): number =>
  doc.tokenScale ?? DEFAULT_TOKEN_SCALE;
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
  /** The texture of real turf over the stripes: grain, a sheen across each mow, worn goalmouths. */
  natural?: boolean;
};

export const DEFAULT_THEME: PitchTheme = {
  surround: "#0d1512",
  grass: "#1c6b3c",
  grassAlt: "#1a6338",
  line: "rgba(255,255,255,0.85)",
  stripeWidth: 105 / 14,
};

/**
 * How far the shade slider moves the green, in HSL lightness at either end.
 *
 * Enough for a floodlit night and a bright afternoon; not so much that the white lines stop
 * reading against the light end or the dark kits vanish into the dark one.
 */
export const GRASS_SHADE_RANGE = 0.13;

/** The theme a board is drawn in: the default, with its grass as its document asks (D89). */
export function themeFor(doc: { grass?: Grass }): PitchTheme {
  const shade = clamp(doc.grass?.shade ?? 0, -1, 1) * GRASS_SHADE_RANGE;
  return {
    ...DEFAULT_THEME,
    grass: lighten(DEFAULT_THEME.grass, shade),
    grassAlt: lighten(DEFAULT_THEME.grassAlt, shade),
    natural: doc.grass?.texture === "natural",
  };
}

/** A colour with its HSL lightness moved by `amount`, hue and saturation kept. */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const L = clamp(l + amount, 0, 1);
  const c = (1 - Math.abs(2 * L - 1)) * sat;
  const x = c * (1 - Math.abs(((h % 6) + 6) % 6 % 2 - 1));
  const m = L - c / 2;
  const sector = Math.floor(((h % 6) + 6) % 6);
  const [r1, g1, b1] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector];
  const hex2 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex2(r1)}${hex2(g1)}${hex2(b1)}`;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * A number in [0, 1) that depends only on a grid cell -- the grain of the turf.
 *
 * Deterministic, so the same board is the same picture in the editor, a thumbnail and an
 * export (`drawBoard` may not use `Math.random`).
 */
function grainAt(i: number, j: number, salt: number): number {
  let h = Math.imul(i ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(j ^ salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Rgb = readonly [number, number, number];

/**
 * A canvas of `cols` x `rows` texels, each lighter or darker than the grass under it by
 * `value(i, j)` in [-0.5, 0.5]: `light` at up to `lightAlpha` above zero, `dark` at up to
 * `darkAlpha` below it. Tinted rather than white and black, which grey a green.
 */
function noiseCanvas(
  cols: number,
  rows: number,
  value: (i: number, j: number) => number,
  light: Rgb,
  lightAlpha: number,
  dark: Rgb,
  darkAlpha: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(cols, rows);
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(cols, rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = value(i, j) * 2;
      const o = (j * cols + i) * 4;
      const [r, gr, bl] = v > 0 ? light : dark;
      img.data[o] = r;
      img.data[o + 1] = gr;
      img.data[o + 2] = bl;
      img.data[o + 3] = Math.round(Math.min(1, Math.abs(v)) * (v > 0 ? lightAlpha : darkAlpha) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/** Sunlit blade tips: yellower than the grass. */
const TIP: Rgb = [196, 222, 128];

/** The shade between blades: bluer and deeper than the grass. */
const ROOT: Rgb = [4, 34, 22];

/** Grass under stress -- dry, or thin -- going straw. */
const STRAW: Rgb = [206, 192, 112];

/** A texture from `cache` if it holds one under `key`, made and kept there otherwise. */
function cached(cache: TurfCache | undefined, key: string, make: () => OffscreenCanvas): OffscreenCanvas {
  if (!cache) return make();
  let canvas = cache.get(key) as OffscreenCanvas | undefined;
  if (!canvas) {
    canvas = make();
    cache.set(key, canvas);
  }
  return canvas;
}

/**
 * A noise tile repeated at `texelM` metres a texel. Repeating a small tile instead of covering
 * the pitch keeps the noise to a few thousand texels; under the other layers the repeat does
 * not show.
 */
function tiled(ctx: Ctx, tile: OffscreenCanvas, texelM: number): CanvasPattern | null {
  const pattern = ctx.createPattern(tile, "repeat");
  pattern?.setTransform(new DOMMatrix().scale(texelM));
  return pattern;
}

/**
 * Blades a texel wide and a few long, laid along the mow, at a little over a device pixel a
 * texel however the board is scaled -- grain on a phone and in a 4K export alike, rather than
 * specks that grow with the zoom.
 */
function bladePattern(ctx: Ctx, turf: TurfCache | undefined): CanvasPattern | null {
  const tile = cached(turf, "blades", () =>
    noiseCanvas(
      GRAIN_TILE,
      GRAIN_TILE,
      (i, j) => {
        const blade = grainAt(i, Math.floor((j + (i % 3)) / BLADE_TEXELS), 7);
        return 0.7 * (blade - 0.5) + 0.3 * (grainAt(i, j, 13) - 0.5);
      },
      TIP,
      0.14,
      ROOT,
      0.22,
    ),
  );
  const t = ctx.getTransform();
  return tiled(ctx, tile, 1.3 / Math.max(Math.hypot(t.a, t.b), 1e-6));
}

/** Side of the clump tile, in texels, and metres a texel. */
const CLUMP_TILE = 48;
const CLUMP_M = 0.35;

/** Side of the grain tile, in texels. A multiple of `BLADE_TEXELS`, so a blade never splits. */
const GRAIN_TILE = 64;

/** How many texels long a blade reads, along the direction the pitch was mown. */
const BLADE_TEXELS = 4;

/** Worn turf: bare earth showing through thin grass. */
const EARTH: Rgb = [190, 176, 112];

/** Metres a texel of the ground layer, which carries everything that varies smoothly. */
const GROUND_M = 1.5;

/** A smooth noise in [0, 1): the hash lattice at every whole coordinate, eased between. */
function valueNoise(x: number, y: number, salt: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const u = ease(x - i);
  const v = ease(y - j);
  const top = grainAt(i, j, salt) * (1 - u) + grainAt(i + 1, j, salt) * u;
  const bottom = grainAt(i, j + 1, salt) * (1 - u) + grainAt(i + 1, j + 1, salt) * u;
  return top * (1 - v) + bottom * v;
}

/**
 * Everything about the turf that varies over metres, computed once a texel and laid in ONE
 * draw: each mowing stripe catching the light across its width, the light over the stadium,
 * lush and thin patches at two scales, a few straw ones, and the wear of the goalmouths and
 * centre. Eight layers drawn one by one cost eight full-canvas fills a frame.
 */
function groundCanvas(L: number, W: number, theme: PitchTheme): OffscreenCanvas {
  const pad = PITCH_PADDING;
  const cols = Math.ceil((L + pad * 2) / GROUND_M) + 1;
  const rows = Math.ceil((W + pad * 2) / GROUND_M) + 1;
  const canvas = new OffscreenCanvas(cols, rows);
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(cols, rows);
  const sunX = L * 0.35;
  const sunY = W * 1.1;
  const sunLen = sunX * sunX + sunY * sunY;
  const wears: [number, number, number, number, number][] = [
    [4, W / 2, 7, 11, 0.12],
    [L - 4, W / 2, 7, 11, 0.12],
    [L / 2, W / 2, 9, 6, 0.05],
  ];

  // One texel's layers, painted over in order the way a canvas composites them: `ink` holds
  // premultiplied colour and alpha, reused for every texel.
  const ink = [0, 0, 0, 0];
  const over = (c: Rgb, alpha: number) => {
    if (alpha <= 0) return;
    ink[0] = c[0] * alpha + ink[0] * (1 - alpha);
    ink[1] = c[1] * alpha + ink[1] * (1 - alpha);
    ink[2] = c[2] * alpha + ink[2] * (1 - alpha);
    ink[3] = alpha + ink[3] * (1 - alpha);
  };
  const shade = (v: number, light: number, dark: number) =>
    v > 0 ? over(TIP, v * light) : over(ROOT, -v * dark);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = -pad + (i + 0.5) * GROUND_M;
      const y = -pad + (j + 0.5) * GROUND_M;
      ink[0] = ink[1] = ink[2] = ink[3] = 0;

      // No two passes of a mower lie quite alike, and each shades across its width.
      if (x >= 0 && x < L) {
        const stripe = Math.floor(x / theme.stripeWidth);
        const across = Math.sin((Math.PI * (x - stripe * theme.stripeWidth)) / theme.stripeWidth);
        const k = 0.7 + 0.6 * grainAt(stripe, 0, 3);
        shade(stripe % 2 === 0 ? across * k : -across * k, 0.1, 0.13);
      }
      const t = Math.min(1, Math.max(0, (x * sunX + y * sunY) / sunLen));
      shade(t < 0.55 ? 1 - t / 0.55 : -(t - 0.55) / 0.45, 0.06, 0.1);
      over(STRAW, Math.max(0, valueNoise(x / 7, y / 7, 97) - 0.6) * 0.3);
      shade(2 * (valueNoise(x / 5, y / 5, 101) - 0.5), 0.05, 0.08);
      shade(2 * (valueNoise(x / 1.8, y / 1.8, 102) - 0.5), 0.04, 0.06);
      for (const [cx, cy, rx, ry, strength] of wears) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d < 1) over(EARTH, strength * (1 - d));
      }

      const o = (j * cols + i) * 4;
      const a = ink[3];
      img.data[o] = a > 0 ? ink[0] / a : 0;
      img.data[o + 1] = a > 0 ? ink[1] / a : 0;
      img.data[o + 2] = a > 0 ? ink[2] / a : 0;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/**
 * The surface of real turf over the plain mow: the ground layer, clumps, and a grain of blades
 * lying the way the mower went.
 *
 * Texture is per-pixel noise, never shapes: any disc or square a drawn texture uses shows as
 * one. Every texel is a hash of its position, so a board is the same picture everywhere. It
 * needs an OffscreenCanvas, as the 3D ground does; without one the stripes draw plain.
 */
function drawNaturalGrass(
  ctx: Ctx,
  L: number,
  W: number,
  theme: PitchTheme,
  blades: CanvasPattern | null,
  turf: TurfCache | undefined,
): void {
  if (typeof OffscreenCanvas === "undefined") return;
  const pad = PITCH_PADDING;
  const x0 = -pad;
  const y0 = -pad;
  const w = L + pad * 2;
  const h = W + pad * 2;

  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const ground = cached(turf, `ground:${L}x${W}:${theme.stripeWidth}`, () =>
    groundCanvas(L, W, theme),
  );
  ctx.drawImage(ground, x0, y0, ground.width * GROUND_M, ground.height * GROUND_M);

  // Clumps: a few pixels across at a normal zoom, between the patches and the blades.
  const clumps = tiled(
    ctx,
    cached(turf, "clumps", () =>
      noiseCanvas(CLUMP_TILE, CLUMP_TILE, (i, j) => grainAt(i, j, 103) - 0.5, TIP, 0.06, ROOT, 0.09),
    ),
    CLUMP_M,
  );
  if (clumps) {
    ctx.fillStyle = clumps;
    ctx.fillRect(x0, y0, w, h);
  }
  ctx.imageSmoothingEnabled = smoothing;

  if (blades) {
    ctx.fillStyle = blades;
    ctx.fillRect(x0, y0, w, h);
  }
}

/**
 * The grain again, over the markings: paint sits IN the grass, and a line drawn crisp on top of
 * a textured pitch is the first thing that gives it away.
 */
function drawGrainOverLines(ctx: Ctx, L: number, W: number, blades: CanvasPattern): void {
  const pad = PITCH_PADDING;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.8;
  ctx.fillStyle = blades;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  ctx.globalAlpha = alpha;
}

/**
 * A goal seen from above: the net as a mesh behind the line, the side and back of its frame,
 * and the two posts -- which is all of a goal a camera looking straight down can see.
 */
function drawGoalFromAbove(ctx: Ctx, goalLine: number, dir: 1 | -1, cy: number): void {
  const P = PITCH;
  const back = goalLine - dir * P.goalDepth;
  const x0 = Math.min(goalLine, back);
  const y0 = cy - P.goalWidth / 2;
  const y1 = cy + P.goalWidth / 2;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(x0, y0, P.goalDepth, P.goalWidth);

  // The mesh, which stops at the frame by construction.
  ctx.beginPath();
  const mesh = 0.45;
  for (let x = x0; x <= x0 + P.goalDepth + 1e-6; x += mesh) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1 + 1e-6; y += mesh) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + P.goalDepth, y);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.restore();

  // The frame the net hangs from: quiet at the back, where it is only a support.
  ctx.beginPath();
  ctx.moveTo(goalLine, y0);
  ctx.lineTo(back, y0);
  ctx.lineTo(back, y1);
  ctx.lineTo(goalLine, y1);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 0.09;
  ctx.stroke();

  // The crossbar, which from above lies along the goal line between the posts.
  ctx.beginPath();
  ctx.moveTo(goalLine, y0);
  ctx.lineTo(goalLine, y1);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.2;
  ctx.stroke();

  // The posts.
  ctx.fillStyle = "#ffffff";
  for (const y of [y0, y1]) {
    ctx.beginPath();
    ctx.arc(goalLine, y, 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw the surface and all markings. Assumes the caller has already applied the
 * metre-space transform, so all coordinates below are metres.
 */
export function drawPitch(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = DEFAULT_THEME,
  /** False where the goals are drawn standing up instead -- the 3D view's ground layer. */
  goals = true,
  /** Where turf textures are kept between draws; see `RenderView.turf`. */
  turf?: TurfCache,
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

  // Made once and laid twice: under the markings and over them.
  const blades =
    theme.natural && typeof OffscreenCanvas !== "undefined" ? bladePattern(ctx, turf) : null;
  if (theme.natural) drawNaturalGrass(ctx, L, W, theme, blades, turf);

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
    if (goals) {
      drawGoalFromAbove(ctx, goalLine, dir, cy);
      ctx.strokeStyle = theme.line;
      ctx.fillStyle = theme.line;
      ctx.lineWidth = P.lineWidth;
    }

    // Corner arcs, quarter circles opening into the pitch.
    for (const corner of [0, W] as const) {
      const start = dir === 1 ? (corner === 0 ? 0 : -Math.PI / 2) : corner === 0 ? Math.PI / 2 : Math.PI;
      ctx.beginPath();
      ctx.arc(goalLine, corner, P.cornerRadius, start, start + Math.PI / 2);
      ctx.stroke();
    }
  }

  if (blades) drawGrainOverLines(ctx, L, W, blades);
}
