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
import { cubicAt, distanceToSegment, type Bezier } from "./geometry";

/** Stroke width in metres, so it scales with the pitch at any export size. */
export const MARK_WIDTH = 0.42;
/** Arrowhead length in metres. */
export const HEAD_LENGTH = 2.2;
export const HEAD_WIDTH = 1.5;
/** Fill opacity for a zone. Light enough to read markings and shirts through. */
export const ZONE_ALPHA = 0.22;
/** Text height in metres. About a token and a half. */
export const TEXT_SIZE = 3.2;
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
 * drawing with them instead of leaving it pinned to a slot. An id that no longer
 * exists falls back to the open end of the timeline, which keeps a document
 * renderable even if pruning has not run yet.
 */
export function sceneRange(doc: BoardDoc, ann: Annotation): [number, number] {
  const last = doc.scenes.length - 1;
  const fromIndex = doc.scenes.findIndex((s) => s.id === ann.from);
  const toIndex = ann.to === null ? last : doc.scenes.findIndex((s) => s.id === ann.to);
  const start = fromIndex < 0 ? 0 : fromIndex;
  const end = toIndex < 0 ? last : toIndex;
  // A range stored backwards still describes the scenes between its ends.
  return start <= end ? [start, end] : [end, start];
}

export function isVisibleAt(doc: BoardDoc, ann: Annotation, sceneIndex: number): boolean {
  if (ann.hidden) return false;
  const [start, end] = sceneRange(doc, ann);
  return sceneIndex >= start && sceneIndex <= end;
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

/** Corners of a two-point shape, normalised so a backwards drag still works. */
export function boundsOf(ann: Annotation): { x: number; y: number; w: number; h: number } {
  if (!isSegment(ann)) {
    const points = ann.kind === "pen" ? ann.points : [ann.at];
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
export type AnnotationHandle = { which: "a" | "b" | "c1" | "c2" | "at"; at: Vec2 };

/**
 * Grab points for the selected shape.
 *
 * A pen stroke has none: reshaping a scribble vertex by vertex is worse than
 * redrawing it.
 */
export function annotationHandles(ann: Annotation): AnnotationHandle[] {
  if (ann.kind === "pen") return [];
  if (ann.kind === "text") return [{ which: "at", at: ann.at }];

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
): Partial<Annotation> {
  if (ann.kind === "text") return { at: to };
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

  const live = new Set(doc.scenes.map((s) => s.id));
  const first = doc.scenes[0]?.id;
  if (first === undefined) return doc;

  let changed = false;
  const next = list.map((ann) => {
    const from = live.has(ann.from) ? ann.from : first;
    const to = ann.to === null || live.has(ann.to) ? ann.to : null;
    if (from === ann.from && to === ann.to) return ann;
    changed = true;
    return { ...ann, from, to };
  });

  return changed ? withAnnotations(doc, next) : doc;
}

/** Scene ids in timeline order — the range control's option list. */
export const sceneOptions = (doc: BoardDoc): Scene[] => doc.scenes;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
