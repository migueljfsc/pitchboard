/**
 * Annotations — the coach's drawing over the top of the tactic.
 *
 * The opposite of a link in every respect. A link has no geometry of its own and
 * is recomputed every frame from where its members happen to be; an annotation
 * is fixed geometry that depends on nobody. What it does have is a scene range,
 * so a zone can matter during the press and be gone once the ball is won.
 *
 * Nothing here reads the clock. Annotations hold still within a scene by design:
 * the players are already moving, and a second thing in motion competes with
 * them for the eye.
 */

import type {
  Annotation,
  AnnotationDash,
  AnnotationKind,
  BoardDoc,
  PathCurve,
  Scene,
  Vec2,
} from "./types";
import { clamp, cubicAt, distanceToSegment, type Bezier } from "./geometry";
import { isVisibleIn, repairRange, sceneSpan } from "./range";

/** Stroke width in metres, so it scales with the pitch at any export size. */
export const MARK_WIDTH = 0.42;
/** Arrowhead length in metres. */
export const HEAD_LENGTH = 2.2;
export const HEAD_WIDTH = 1.5;
/** Fill opacity for a zone. Light enough to read markings and shirts through. */
export const ZONE_ALPHA = 0.22;
/** Text height in metres, at the default size. About a token and a half. */
export const TEXT_SIZE = 3.2;
/** Bounds on a label's own size multiplier. */
/**
 * A character's width and a line's height, both as multiples of the type size.
 *
 * Estimates, and deliberately the ONLY estimates: the renderer wraps with these numbers too,
 * so the box, the hit test and the drawn text always agree with each other even where they
 * all disagree slightly with the real glyphs. Measuring in the renderer and estimating here
 * would put the selection box in a different place from the words inside it.
 */
export const TEXT_CHAR_W = 0.55;
export const TEXT_LINE_H = 1.25;

/** Narrow enough to be a column, wide enough that the pitch is the real limit. */
export const TEXT_WIDTH_MIN = 4;
export const TEXT_WIDTH_MAX = 105;

export const TEXT_SCALE_MIN = 0.4;
export const TEXT_SCALE_MAX = 4;

/**
 * The panel behind a label: how far it reaches past the words, and how solid it is
 * when the author has not said.
 *
 * The padding is a multiple of the type size rather than a fixed distance, so a
 * label at 400% gets a panel in proportion rather than words pressed to the edge.
 */
export const TEXT_BG_PAD = 0.32;
export const TEXT_BG_ALPHA = 0.72;
/** Samples along a curved arrow. Matches the run curves' resolution. */
export const CURVE_SAMPLES = 32;
/** Dribble squiggle, in metres. */
export const WAVE_AMPLITUDE = 0.55;
export const WAVE_LENGTH = 2.6;
/** Dash pattern for a pass, in metres. */
export const DASH_PATTERN: [number, number] = [1.4, 1.0];
/** Freehand simplification tolerance, in metres. */
export const PEN_EPSILON = 0.18;
/** Smallest drag that commits a shape. Below this it was a click, not a draw. */
export const MIN_DRAG = 1.2;
/** How far a duplicate sits from its original, in metres — clear of it, still beside it. */
export const DUPLICATE_OFFSET = 2.5;

export const annotationsOf = (doc: BoardDoc): Annotation[] => doc.annotations ?? [];

const withAnnotations = (doc: BoardDoc, annotations: Annotation[]): BoardDoc => ({
  ...doc,
  annotations,
});

// ------------------------------------------------------------------ visibility

/**
 * The scene index range an annotation covers, inclusive.
 *
 * Stored as scene ids rather than indices so reordering scenes carries the
 * drawing with them instead of leaving it pinned to a slot. The rule itself lives
 * in `range.ts`, because links answer the same question and must not have to
 * import this module to ask it. These two keep their annotation-shaped signatures
 * so every caller reads the way it always did.
 */
export function sceneRange(doc: BoardDoc, ann: Annotation): [number, number] {
  return sceneSpan(doc, ann);
}

export function isVisibleAt(doc: BoardDoc, ann: Annotation, sceneIndex: number): boolean {
  return isVisibleIn(doc, ann, sceneIndex);
}

/** Annotations drawn on a scene, in document order — which is z-order. */
export function visibleAt(doc: BoardDoc, sceneIndex: number): Annotation[] {
  return annotationsOf(doc).filter((a) => isVisibleAt(doc, a, sceneIndex));
}

// -------------------------------------------------------------------- geometry

const isSegment = (
  ann: Annotation,
): ann is Extract<Annotation, { a: Vec2; b: Vec2 }> => "a" in ann && "b" in ann;

/** Control points that make a cubic bezier trace a straight line. */
export function straightCurve(a: Vec2, b: Vec2): PathCurve {
  return {
    c1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    c2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
  };
}

/**
 * The polyline a shape is stroked along. One function for the renderer and the
 * hit-test, so what you can click is exactly what you can see.
 */
export function strokePoints(ann: Annotation, samples = CURVE_SAMPLES): Vec2[] {
  if (ann.kind === "pen") return ann.points;
  if (ann.kind !== "arrow" && ann.kind !== "line") return [];
  // An unbent arrow is two points. Sampling 32 along a straight line would buy
  // nothing but a slower dash pattern.
  if (!ann.curve) return [ann.a, ann.b];

  const b: Bezier = { p0: ann.a, c1: ann.curve.c1, c2: ann.curve.c2, p1: ann.b };
  const out: Vec2[] = [];
  for (let i = 0; i <= samples; i++) out.push(cubicAt(b, i / samples));
  return out;
}

/**
 * Displace a polyline into a squiggle — the dribble convention.
 *
 * Offsets perpendicular to the local direction by a sine of distance travelled,
 * so the wave keeps a constant wavelength however the line bends, and both ends
 * land exactly on the originals.
 */
export function wavy(
  points: Vec2[],
  amplitude = WAVE_AMPLITUDE,
  wavelength = WAVE_LENGTH,
): Vec2[] {
  if (points.length < 2) return points;

  // Resample at a fixed step: the wave needs more vertices than a straight
  // two-point line has.
  const step = wavelength / 8;
  const dense = resample(points, step);
  const total = polylineLength(dense);
  if (total < wavelength) return points;

  // Whole number of waves, so the far end returns to the centreline.
  const waves = Math.max(1, Math.round(total / wavelength));
  const out: Vec2[] = [];
  let travelled = 0;

  for (let i = 0; i < dense.length; i++) {
    if (i > 0) travelled += dist(dense[i - 1], dense[i]);
    const u = travelled / total;
    const dir = direction(dense, i);
    // Taper to zero at both ends so the squiggle starts and stops on the line.
    const taper = Math.sin(Math.PI * u);
    const offset = amplitude * taper * Math.sin(2 * Math.PI * waves * u);
    out.push({ x: dense[i].x - dir.y * offset, y: dense[i].y + dir.x * offset });
  }
  return out;
}

/** Unit direction at vertex `i`, averaged across the vertex where possible. */
function direction(points: Vec2[], i: number): Vec2 {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const len = dist(a, b);
  return len === 0 ? { x: 1, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function resample(points: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

export function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

type TextAnnotation = Extract<Annotation, { kind: "text" }>;

/**
 * Height of a label in metres. `size` is a multiplier on TEXT_SIZE so the
 * default stays defined in exactly one place, and clamped here rather than
 * trusted: an imported document is untrusted input.
 */
export function textSize(ann: TextAnnotation): number {
  return TEXT_SIZE * clamp(ann.size ?? 1, TEXT_SCALE_MIN, TEXT_SCALE_MAX);
}

/**
 * The lines a label actually draws as.
 *
 * Explicit newlines always break. A `width` additionally wraps on words, so a label becomes
 * a text box rather than one ever-lengthening line — which was the whole problem: without a
 * box there is nowhere for a second line to go.
 *
 * A single word longer than the box overflows rather than being broken mid-word. Hyphenating
 * a player's name to fit is worse than a line that sticks out, and the author can widen it.
 */
export function textLines(ann: TextAnnotation): string[] {
  const paragraphs = ann.text.split("\n");
  if (ann.width === undefined) return paragraphs;

  const perChar = textSize(ann) * TEXT_CHAR_W;
  const columns = Math.max(1, Math.floor(textWidth(ann) / perChar));

  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      // A blank line in the source is a blank line on the board.
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      // `!line` keeps the first word even when it alone is too long: something has to go on
      // the line, and pushing an empty one would loop forever.
      if (candidate.length <= columns || !line) {
        line = candidate;
        continue;
      }
      out.push(line);
      line = word;
    }
    out.push(line);
  }
  return out;
}

/**
 * Opacity of the panel behind a label.
 *
 * Clamped rather than trusted, like every other imported number. Says nothing about
 * whether there IS a panel — that is `ann.bg`, and asking for one without a colour
 * paints nothing.
 */
export function textBgAlpha(ann: TextAnnotation): number {
  return clamp(ann.bgOpacity ?? TEXT_BG_ALPHA, 0, 1);
}

/** Clamped here rather than trusted: an imported document is untrusted input. */
export function textWidth(ann: TextAnnotation): number {
  return clamp(ann.width ?? TEXT_WIDTH_MAX, TEXT_WIDTH_MIN, TEXT_WIDTH_MAX);
}

/**
 * Rough extent of a label, without measuring it.
 *
 * The renderer is pure and gets no ctx here, so width is estimated from the character count —
 * and the renderer wraps with the same estimate, so the two never disagree. Only the selection
 * box and the hit-test use this, and both are forgiving.
 */
export function textExtent(ann: TextAnnotation): { w: number; h: number } {
  const size = textSize(ann);
  const lines = textLines(ann);
  const longest = lines.reduce((n, line) => Math.max(n, line.length), 0);
  // A box that was given a width keeps it even when the words do not fill it: that is the
  // shape the author dragged, and it is what the next line will wrap into.
  const w = ann.width === undefined ? longest * size * TEXT_CHAR_W : textWidth(ann);
  return {
    w: Math.max(size * 0.7, w),
    h: Math.max(1, lines.length) * size * TEXT_LINE_H,
  };
}

/**
 * Corners of a two-point shape, normalised so a backwards drag still works.
 *
 * `rotated` is the board's framing, and only a label cares about it: text stays
 * upright while the board turns, so on a vertical board its lines run along pitch
 * y and stack along pitch x. Every other shape is drawn in pitch space and looks
 * the same either way. Pass it wherever a rotated board is possible — the default
 * is the flat case, and getting it wrong misplaces only the chrome, quietly.
 */
export function boundsOf(
  ann: Annotation,
  rotated = false,
): { x: number; y: number; w: number; h: number } {
  if (ann.kind === "text") {
    // Drawn centred on `at`, so the box straddles it.
    const e = textExtent(ann);
    const w = rotated ? e.h : e.w;
    const h = rotated ? e.w : e.h;
    return { x: ann.at.x - w / 2, y: ann.at.y - h / 2, w, h };
  }
  if (!isSegment(ann)) {
    const points = ann.points;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const x = Math.min(ann.a.x, ann.b.x);
  const y = Math.min(ann.a.y, ann.b.y);
  return { x, y, w: Math.abs(ann.b.x - ann.a.x), h: Math.abs(ann.b.y - ann.a.y) };
}

// -------------------------------------------------------------- simplification

/**
 * Ramer–Douglas–Peucker. A freehand stroke arrives as one point per pointer
 * event — hundreds for a short scribble — and every one of them ends up in the
 * share URL. Simplifying on commit typically drops 90% of them with no visible
 * change to the line.
 */
export function simplify(points: Vec2[], epsilon = PEN_EPSILON): Vec2[] {
  if (points.length <= 2) return points.slice();

  const first = points[0];
  const last = points[points.length - 1];
  let worst = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], first, last);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }

  if (worst <= epsilon) return [first, last];
  return [
    ...simplify(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(index), epsilon),
  ];
}

// --------------------------------------------------------------------- editing

function freshId(doc: BoardDoc): string {
  const taken = new Set(annotationsOf(doc).map((a) => a.id));
  let n = annotationsOf(doc).length + 1;
  while (taken.has(`ann-${n}`)) n++;
  return `ann-${n}`;
}

type DraftOptions = {
  color: string;
  dash?: AnnotationDash;
  text?: string;
  points?: Vec2[];
};

/**
 * Build a shape from a drag, not yet in the document.
 *
 * The id is generated up front so the draft can be rendered, selected and
 * committed without changing identity along the way.
 */
export function draftAnnotation(
  doc: BoardDoc,
  kind: AnnotationKind,
  sceneId: string,
  a: Vec2,
  b: Vec2,
  options: DraftOptions,
): Annotation {
  const base = { id: freshId(doc), from: sceneId, to: null, color: options.color } as const;
  const dash = options.dash ?? "solid";

  switch (kind) {
    case "arrow":
      return { ...base, kind: "arrow", a, b, curve: null, dash };
    case "line":
      return { ...base, kind: "line", a, b, curve: null, dash };
    case "rect":
      return { ...base, kind: "rect", a, b };
    case "ellipse":
      return { ...base, kind: "ellipse", a, b };
    case "pen":
      return { ...base, kind: "pen", points: options.points ?? [a, b] };
    case "text":
      return { ...base, kind: "text", at: a, text: options.text ?? "" };
  }
}

export function addAnnotation(doc: BoardDoc, ann: Annotation): BoardDoc {
  return withAnnotations(doc, [...annotationsOf(doc), ann]);
}

export function updateAnnotation(
  doc: BoardDoc,
  id: string,
  patch: Partial<Annotation>,
): BoardDoc {
  const list = annotationsOf(doc);
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return doc;
  const next = list.slice();
  // The patch never changes `kind`, so the union member is preserved.
  next[i] = { ...next[i], ...patch } as Annotation;
  return withAnnotations(doc, next);
}

/**
 * A second copy of a shape, offset so it is visibly its own thing.
 *
 * Inserted directly after the original rather than at the end: the list is the
 * drawing order, and a copy belongs in the same layer as what it was copied from.
 * The offset is not clamped to the pitch for the same reason a drag is not — the
 * board draws its surround and a shape is allowed to sit in it.
 *
 * `name` is the copy's, because this module has no language to make one in (D38).
 */
export function duplicateAnnotation(doc: BoardDoc, id: string, name?: string): BoardDoc {
  const list = annotationsOf(doc);
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return doc;

  const copy = { ...structuredClone(list[i]), id: freshId(doc), name: name ?? list[i].name };
  const next = list.slice();
  next.splice(i + 1, 0, copy);
  // Shifted through moveAnnotation so the offset knows about pen points, a label's
  // anchor and a curve's controls without saying any of it twice.
  return moveAnnotation(withAnnotations(doc, next), copy.id, {
    x: DUPLICATE_OFFSET,
    y: DUPLICATE_OFFSET,
  });
}

/**
 * Move a shape within the list, which is the drawing order.
 *
 * Only decides ties inside a layer: zones are painted before the players and
 * marks after them whatever the order, so moving a zone past an arrow changes
 * nothing. See D20.
 */
export function reorderAnnotation(doc: BoardDoc, from: number, to: number): BoardDoc {
  const list = annotationsOf(doc);
  const n = list.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return doc;

  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return withAnnotations(doc, next);
}

export function deleteAnnotation(doc: BoardDoc, id: string): BoardDoc {
  const list = annotationsOf(doc);
  const next = list.filter((a) => a.id !== id);
  return next.length === list.length ? doc : withAnnotations(doc, next);
}

/** Move a shape bodily, every point by the same delta. */
export function moveAnnotation(doc: BoardDoc, id: string, delta: Vec2): BoardDoc {
  const ann = annotationsOf(doc).find((a) => a.id === id);
  if (!ann) return doc;
  const shift = (p: Vec2): Vec2 => ({ x: p.x + delta.x, y: p.y + delta.y });

  if (ann.kind === "pen") {
    return updateAnnotation(doc, id, { points: ann.points.map(shift) });
  }
  if (ann.kind === "text") {
    return updateAnnotation(doc, id, { at: shift(ann.at) });
  }
  const curve =
    "curve" in ann && ann.curve ? { c1: shift(ann.curve.c1), c2: shift(ann.curve.c2) } : undefined;
  return updateAnnotation(doc, id, {
    a: shift(ann.a),
    b: shift(ann.b),
    ...(curve ? { curve } : {}),
  });
}

// --------------------------------------------------------------------- handles

/** Handle names are shape-specific; `c1`/`c2` bend a curve, the rest reshape. */
export type AnnotationHandle = { which: "a" | "b" | "c1" | "c2" | "at" | "w"; at: Vec2 };

/**
 * Grab points for the selected shape.
 *
 * A pen stroke has none: reshaping a scribble vertex by vertex is worse than
 * redrawing it.
 */
export function annotationHandles(ann: Annotation, rotated = false): AnnotationHandle[] {
  if (ann.kind === "pen") return [];
  if (ann.kind === "text") {
    // Two: one to move it, one on the far end of the line to set the box width. The width
    // handle is what makes a second line possible at all, so it is offered as soon as a
    // label is selected rather than hidden behind a mode.
    //
    // "Far end of the line", not "right", because the words turn with the board and the
    // handle has to sit where the last character does.
    const { w } = textExtent(ann);
    const edge = rotated
      ? { x: ann.at.x, y: ann.at.y + w / 2 }
      : { x: ann.at.x + w / 2, y: ann.at.y };
    return [
      { which: "at", at: ann.at },
      { which: "w", at: edge },
    ];
  }

  const ends: AnnotationHandle[] = [
    { which: "a", at: ann.a },
    { which: "b", at: ann.b },
  ];
  if (ann.kind !== "arrow" && ann.kind !== "line") return ends;

  const curve = ann.curve ?? straightCurve(ann.a, ann.b);
  return [...ends, { which: "c1", at: curve.c1 }, { which: "c2", at: curve.c2 }];
}

/**
 * Move one handle. Dragging `c1`/`c2` materialises a real curve out of the
 * synthesised straight one, the same bargain the run curves make.
 */
export function dragAnnotationHandle(
  ann: Annotation,
  which: AnnotationHandle["which"],
  to: Vec2,
  rotated = false,
): Partial<Annotation> {
  if (ann.kind === "text") {
    // Along the line of the text, which is pitch y on a vertical board. Doubled, because
    // the box is centred on `at` — the edge moves half as far as the width.
    if (which === "w") {
      const reach = rotated ? to.y - ann.at.y : to.x - ann.at.x;
      return { width: clamp(reach * 2, TEXT_WIDTH_MIN, TEXT_WIDTH_MAX) };
    }
    return { at: to };
  }
  if (ann.kind === "pen") return {};

  if (which === "a" || which === "b") return { [which]: to } as Partial<Annotation>;
  if (ann.kind !== "arrow" && ann.kind !== "line") return {};

  const curve = ann.curve ?? straightCurve(ann.a, ann.b);
  return { curve: which === "c1" ? { c1: to, c2: curve.c2 } : { c1: curve.c1, c2: to } };
}

// --------------------------------------------------------------------- pruning

/**
 * Repair scene references after the scene list changes.
 *
 * A deleted scene leaves annotations pointing at an id that is gone. Rather than
 * discard the drawing, the range is pulled back to the surviving scenes: `from`
 * to the first scene, `to` to open-ended. Losing a drawing because a scene was
 * deleted would be a far worse trade than showing it slightly too widely.
 */
export function pruneAnnotations(doc: BoardDoc): BoardDoc {
  const list = annotationsOf(doc);
  if (list.length === 0) return doc;

  let changed = false;
  const next = list.map((ann) => {
    const repaired = repairRange(doc, ann);
    if (repaired !== ann) changed = true;
    return repaired;
  });

  return changed ? withAnnotations(doc, next) : doc;
}

/** Scene ids in timeline order — the range control's option list. */
export const sceneOptions = (doc: BoardDoc): Scene[] => doc.scenes;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
