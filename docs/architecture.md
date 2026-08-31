# Pitchboard — Architecture

Technical reference for the board engine. Read this before touching `src/board/`.

---

## 1. The core rule

**The renderer is a pure function of `(document, time)`.**

```ts
drawBoard(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
          doc: BoardDoc,
          t: number,           // seconds from timeline start
          view: Viewport): void
```

No DOM access, no React, no module-level mutable state, no reads of `Date.now()` or
`Math.random()`. Given the same three arguments it must emit the same pixels, every time, in
any thread.

Everything else follows from this:

```
                    ┌──────────────────────────────┐
                    │  src/board/render.ts         │
                    │  drawBoard(ctx, doc, t, view)│
                    └──────────────┬───────────────┘
                    ┌──────────────┴───────────────┐
                    ▼                              ▼
        EDITOR (main thread)            EXPORTER (Web Worker)
        <canvas> + rAF loop             OffscreenCanvas 1920×1080
        pointer hit-testing             t = 0 … duration, step 1/fps
        React chrome around it          → mediabunny CanvasSource
                                        → MP4 / WebM / GIF
```

Two payoffs. The exporter renders offline, faster than realtime, dropping no frames — it never
touches `requestAnimationFrame` or the compositor. And preview/export divergence becomes
structurally impossible rather than a class of bug to hunt.

**The rule that protects it:** if you find yourself wanting to read something from the DOM,
a React ref, or a hook inside `render.ts`, that value belongs in `BoardDoc` or `Viewport`
instead. There is no third source of truth.

---

## 2. Coordinate system

All document coordinates are **pitch metres**, origin at the top-left corner of the pitch,
`x` along the length, `y` across the width. Never pixels.

This buys three things: the renderer is resolution-independent, export at any size is a scale
change, and link distance metrics are already in the right unit.

```ts
type Viewport = { scale: number; offsetX: number; offsetY: number }   // px per metre, px, px

// What drawBoard actually receives. Canvas size is included so a single call
// paints the surround too and yields a complete frame — the export worker relies
// on that. Selection and hover are arguments, never read from React, which is
// what keeps the renderer pure.
type RenderView = Viewport & {
  width: number; height: number
  interactive: boolean
  selection?: ReadonlySet<string>
  hover?: string | null
  marquee?: { a: Vec2; b: Vec2 } | null
}

const toScreen = (p: Vec2, v: Viewport) => ({ x: p.x * v.scale + v.offsetX,
                                              y: p.y * v.scale + v.offsetY })
const toPitch  = (p: Vec2, v: Viewport) => ({ x: (p.x - v.offsetX) / v.scale,
                                              y: (p.y - v.offsetY) / v.scale })
```

`toPitch` is what makes pointer hit-testing work: convert the event position once, then do all
hit maths in metres.

### Pitch dimensions

Real IFAB dimensions. Getting these exact is most of the difference between looking amateur and
looking right, so they live in one table in `src/board/pitch.ts` and are never inlined.

| Feature | Value (m) |
|---|---|
| Pitch | 105 × 68 |
| Goal width | 7.32 |
| Goal depth (drawn) | 2.0 |
| Six-yard box | 5.5 deep × 18.32 wide |
| Penalty area | 16.5 deep × 40.32 wide |
| Penalty spot | 11.0 from goal line |
| Penalty arc radius | 9.15 |
| Centre circle radius | 9.15 |
| Centre spot / corner arc radius | 0.3 / 1.0 |
| Line width | 0.12 |

The penalty arc is the part people get wrong: it is the portion of a 9.15 m circle centred on
the **penalty spot** that falls outside the penalty area, not an arc on the box edge. Draw it
with `ctx.arc` clipped to `x > 16.5`, or compute the intersection angle directly.

### Device pixel ratio

Editor only — the exporter renders at an explicit size and ignores DPR.

```ts
canvas.width  = cssWidth  * devicePixelRatio
canvas.height = cssHeight * devicePixelRatio
ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
```

`Viewport.scale` stays in CSS pixels per metre. DPR is handled by the transform above and must
not leak into the viewport, or export sizing will be wrong on retina machines.

---

## 3. Document schema

`src/board/types.ts` is the single source of truth for the shape; `src/board/schema.ts` derives
the zod validator and is imported by both the app and the Worker. This mirrors the
`cv.ts` / `site.ts` convention in the sibling projects.

Documents are constructed by `createBoardDoc()` in `src/formations/index.ts` rather than by a
factory in `schema.ts` — a new board is entirely formation-driven, and putting it there would
make `schema.ts` depend on the presets.

```ts
type Vec2 = { x: number; y: number }

/** Cubic bezier control points, in pitch metres. Endpoints come from the scene positions. */
type PathCurve = { c1: Vec2; c2: Vec2 }

type Player = {
  id: string
  number: number
  label: string          // surname or free text
}

type Team = {
  id: string
  name: string
  color: string          // token fill
  textColor: string      // number/label contrast colour
  players: Player[]
  hidden?: boolean
  formation?: string     // the preset it was built from, e.g. "4-3-3"
}

type Scene = {
  id: string
  name: string
  transitionMs: number                       // travel time INTO this scene (ignored on scene 0)
  holdMs: number                             // still time at this scene
  positions: Record<string, Vec2>            // entityId → position, metres
  paths: Record<string, PathCurve | null>    // entityId → curve travelled INTO this scene
  carrier: string | null                     // player holding the ball, or null
  ballPos?: Vec2                             // only when carrier === null
  ballPath?: PathCurve | null                // curve for a pass or a loose-ball travel
  travel?: Record<string, number>            // per-entity travel time, ms, overriding transitionMs
  hiddenRuns?: string[]                      // entities whose arrow is not drawn (BALL_ID allowed)
  shot?: boolean                             // the ball's travel in is a strike, not a pass
}

type LinkStyle = 'chain' | 'polygon' | 'filled'

type Link = {
  id: string
  name: string                               // "Back 4", "Midfield 3"
  members: string[]                          // ordered — order defines chain sequence
  style: LinkStyle
  color?: string                             // absent = follow the members' kit (linkColor)
  showDistances: boolean
}

type AnnotationDash = 'solid' | 'dashed' | 'wavy'   // run | pass | dribble

/** Fixed geometry that depends on nobody — the opposite of a link in every respect. */
type Annotation = {
  id: string
  from: string                               // scene id it first appears on
  to: string | null                          // last scene id; null runs to the end
  color: string
  hidden?: boolean
} & (
  | { kind: 'arrow' | 'line'; a: Vec2; b: Vec2; curve?: PathCurve | null; dash: AnnotationDash }
  | { kind: 'rect' | 'ellipse'; a: Vec2; b: Vec2 }   // a/b are the bounding box
  | { kind: 'pen'; points: Vec2[] }                  // simplified on commit, capped at 400
  | { kind: 'text'; at: Vec2; text: string; size?: number }   // multiplier on TEXT_SIZE, 0.4–4
)

type BoardDoc = {
  version: 1
  name: string
  pitch: { length: number; width: number }   // defaults 105 × 68
  tokenScale?: number                        // 0.5–2.5, default DEFAULT_TOKEN_SCALE (1.25)
  flow?: { speed: number; endHoldMs: number } // seamless playback; absent = per-scene timings
  teams: [Team, Team]
  scenes: Scene[]                            // at least one
  links: Link[]
  annotations?: Annotation[]                 // absent on a board drawn before M7
}
```

### Schema invariants

Enforced by zod, and worth asserting in tests because violations produce confusing render bugs
rather than crashes:

- `scenes.length >= 1`
- every `scenes[i].positions` has a key for every player in both teams
- `paths` keys are a subset of `positions` keys
- `carrier`, when set, references a real player id
- `ballPos` is present exactly when `carrier === null`
- `links[].members` reference real player ids, and `length >= 2`
- `annotations[].from` and `.to` reference real scene ids, or `to` is null
- `scenes[0].transitionMs` is ignored — there is nothing to travel from

`Team.formation` lives in the document rather than in editor state so a board that arrives by
import or share still knows its own shape. That is what makes a positions-only reset possible:
without it, resetting could only reach the hard-coded defaults.

**Paths are stored on the scene being travelled into.** Scene *i*'s `paths[e]` describes how
entity *e* gets from its scene *i-1* position to its scene *i* position. Storing it on the
destination means deleting a scene cannot orphan a path — the path dies with the scene that
owned it.

### Versioning

`version` is a literal `1`. Any future schema change bumps it and adds a migration in
`src/board/migrate.ts` that runs on load, before validation. Share links are immutable and
permanent, so a v1 document published today must still open years from now.

---

## 4. Timeline

### Layout

Scene 0 contributes only its hold. Every later scene contributes a transition then a hold.

```
 t=0
 │
 ├─ s0.hold ─┼─ s1.transition ─┼─ s1.hold ─┼─ s2.transition ─┼─ s2.hold ─┤
 │           │                 │           │                 │           │
 static      travelling        static      travelling        static     end
```

```
totalMs = scenes[0].holdMs
        + Σ (scenes[i].transitionMs + scenes[i].holdMs)   for i in 1..n-1
```

### Timing

`sceneTimings(doc)` is the single source of what each scene is worth: `totalDurationMs`,
`resolveAt` and `sceneStartSeconds` all read it rather than the raw fields. Two modes feed it —
the per-scene `transitionMs`/`holdMs`, or `doc.flow`, which paces every transition at one speed
and holds only the final frame. See D27, including why removing the holds is not on its own
enough to make playback seamless.

### Resolution

```ts
type Resolved = {
  from: Scene          // scene being interpolated out of
  to: Scene            // scene being interpolated into
  u: number            // 0..1 raw progress; exactly 1 during holds
  moving: boolean      // false during a hold — lets the renderer skip path decoration
}

resolveAt(doc: BoardDoc, t: number): Resolved
```

Walk the segments accumulating time. During a hold, return `from === to` and `u = 1` so callers
need no special case. Clamp `t` to `[0, totalMs/1000]`; scrubbing past either end is common and
must not produce `NaN`.

### Entity position

```ts
positionAt(entityId, resolved, doc): Vec2
```

- no path → `lerp(from.positions[e], to.positions[e], ease(u))`
- path → cubic bezier at `s(ease(u))`, endpoints from the two scenes, controls from the path

Default easing is `easeInOutCubic`.

### Arc-length reparameterisation — the one piece of real maths

A cubic bezier sampled at uniform `u` does **not** move at uniform speed. Control points cluster
parameter space near the curve's tighter regions, so a player visibly surges through one part of
a run and stalls in another. It reads as broken the first time you scrub a curved run, and it is
the single most likely thing to get wrong in this codebase.

The fix: build a cumulative arc-length table, then invert it.

```
1. Sample the curve at 64 uniform u values, accumulating chord length between samples.
2. Normalise to get L(u) ∈ [0,1] — fraction of total length travelled by parameter u.
3. Invert: given desired fraction d, binary-search the table for the bracketing pair and
   linearly interpolate to recover u. That is s(d).
4. Evaluate the bezier at s(d), not at d.
```

64 samples is comfortably enough for the curve lengths a tactics board produces; the residual
error is far below a pixel.

**The table is deliberately not cached.** Building one is ~2,000 flops; 22 entities at 60 fps is
under 3 MFLOP/s, which is nothing. A cache would need invalidating whenever an endpoint or a
control point moved, and it would put mutable module state on the renderer's path — the one
thing `drawBoard`'s purity rule forbids. Recomputing is cheaper than being wrong.

`src/board/geometry.ts` owns this, and it is the most heavily tested file in the repo. The test
that matters asserts constant speed numerically: sampled at uniform parameter the chord lengths
vary by more than 1.5x, and after reparameterisation by less than 1.05x.

---

## 5. Ball model

The ball is derived, not stored — while carried it has no independent position. `scene.carrier`
names the holder. A **pass is a carrier change**; there is no pass object. This is what keeps
the model small.

| `from.carrier` → `to.carrier` | Behaviour |
|---|---|
| `A → A` | Glued to A's interpolated position, offset ~1.2 m along A's direction of travel. A dribble: the ball moves, but the movement is A's, so no ball line is drawn |
| `A → B` | **Pass.** Travels from A's position to B's, following `to.ballPath` if drawn |
| `A → null` | Loose. Travels from A's position to `to.ballPos` |
| `null → B` | Collected. Travels from `from.ballPos` to B's position |
| `null → null` | Free entity — `ballPos` to `ballPos`, along `ballPath` if drawn |

Two details that matter:

**Pass easing is different.** Player movement uses `easeInOutCubic`; a pass uses `easeOutQuad` —
struck hard, decelerating. A ball that eases in like a jogging player looks wrong immediately.

**Endpoints are evaluated live.** Both ends of a pass come from `positionAt`, never from raw
scene data, so the ball tracks a receiver who is still running and arrives with them. Aiming at
the receiver's scene-*start* position instead lands the ball tens of metres adrift and teleports
it onto them at the handoff — there is a test for exactly that.

The glued offset points along the carrier's direction of travel (falling back to a fixed
downfield offset when stationary) so the ball sits ahead of the player and the token's number
stays readable.

### Highlights

`Scene.highlight` is a record of entity id to halo colour: who matters in this scene, and what
colour to say it in. It sits beside `carrier`, `travel` and `delay` because that is the axis it
varies on — a player is in every scene, and what changes is whether they matter in this one.

`highlightAt(id, resolved)` interpolates the strength on the same easing the positions use, so
the glow comes up as the player arrives rather than snapping on when the transition starts. It
never carries forward, which is the one place it deliberately parts company with a drag (D41 vs
D47).

---

## 6. Links

The headline feature. A link is a connector recomputed every frame from its members' current
interpolated positions — players still move individually, and the connector deforms as they do.

```ts
linkGeometry(link: Link, resolved: Resolved, doc: BoardDoc): {
  points: Vec2[]           // member positions, in member order
  closed: boolean
  edges: { a: Vec2; b: Vec2; metres: number }[]
}
```

- `chain` — open polyline in member order. A back 4 must **not** close back on itself; that
  closing edge running the width of the pitch is the obvious wrong output.
- `polygon` — closed path.
- `filled` — closed path plus translucent fill. The enclosed area visibly collapses and expands,
  which is the clearest read of a unit compressing or getting stretched.

A link also carries a **scene range** — `from` and `to`, the same pair an annotation has and the
same rule, in `board/range.ts` so neither module has to import the other. Both ends are optional
here and neither means the open end, so a link that has never been ranged shows on every scene
exactly as links always did (D47).

`showDistances` labels each edge at its midpoint in metres. Distances come straight from the
pitch-metre coordinates — no conversion, which is a large part of why the coordinate system is
what it is. Labels are drawn upright regardless of edge angle; rotating text with the edge looks
clever and reads badly.

Member order is meaningful for `chain` and for the perimeter walk of `polygon`, so the editor
must expose reordering, not just add/remove.

---

## 7. Renderer

### Draw order

Back to front. Order is fixed; hit-testing walks it in reverse.

```
1. pitch surface + markings          (pitch.ts)
2. annotation zones                  shaded areas are background; over the play they drown it
3. links                             under players, so tokens stay legible
4. link distance labels
5. motion paths / arrowheads         only when moving, or when the entity is selected
5b. the ball's own line              dashed for a pass, doubled for a shot; scene.hiddenRuns suppresses either
6. player tokens + numbers/labels
7. ball                              above players — it must never be occluded
8. annotation marks                  arrows, freehand, text — the coach talking over the top
9. selection affordances             editor only, suppressed during export
```

Annotations straddle the stack: zones at 2, everything else at 8. Hit-testing walks the same
split, so a zone loses a click to a player standing on it and an arrow wins one.

Selection handles, marquee, and hover states are gated behind `view.interactive`. Export passes
`false`, which is the only branch in the renderer that distinguishes the two contexts — and it
only ever *removes* chrome, never changes board content.

### Token rendering

Tokens are circles of fixed metre radius (~1.1 m), so they scale with the pitch and keep correct
relative size at every export resolution. Number centred, label below the token. Font size is
derived from `view.scale` so text stays proportional rather than shrinking to nothing at 4×.

---

### Undo

`src/lib/history.ts` holds past/present/future snapshots of `BoardDoc` outside the document, so
nothing about editing history reaches the schema, a share link or an export. Coalescing is by
explicit key rather than by time — see D26.

### Panels

The left rail holds everything that makes a board: teams, drawing tools, links, the selection.
The right rail is an inventory of one thing — every shape drawn, with the scenes it appears on.
It exists because the canvas can only show the drawing for the scene it is on, so a shape ranged
to scene 4 is both invisible and unfindable from scene 1; selecting it there jumps the scrubber
to where it starts. It collapses to a strip, since an empty rail is 256px of pitch given away.

Shapes are grouped by their **starting** scene, and each group collapses. Reordering is confined
to one group: the group is decided by the shape's starting scene, so a row dropped into another
group would snap straight back, and a drop that crossed groups would index the wrong rows. A
cross-group drop is therefore a no-op rather than a move, and no drop line is drawn outside the
group a drag began in.

---

## 8. Interaction

`src/board/interaction.ts`. Hand-rolled, and small — this is the cost of not using a canvas
library, and it is about 350 lines.

Hit-testing, in reverse draw order, all in pitch metres:

| Target | Test |
|---|---|
| Token | distance to centre < token radius |
| Bezier control handle | distance to point < handle radius, only when parent selected |
| Path | `ctx.isPointInStroke` against a widened stroke |
| Link edge | point-to-segment distance < threshold |
| Annotation mark | point-to-segment against the sampled stroke, above tokens |
| Annotation zone | inside the rect, or inside the normalised ellipse, below tokens |
| Annotation handle | distance to point, only for the selected shape — tested before everything |
| Text label | radius scaled by `textSize(ann)` — the box is not axis-aligned on a rotated board |

Selection is a `Set<entityId>`. Shift-click toggles; marquee adds everything intersecting.
Dragging a selection applies the same delta to every member, preserving relative spacing. The
line nudge shifts a whole unit up- or downfield in one action — the most common edit when
setting up consecutive scenes, and painful without it.

Editing only ever mutates the **current scene's** `positions`. Dragging a player never
retroactively changes an earlier scene.

---

## 9. Export

`src/export/` — four consumers, one seam. `frame.ts` decides how big a frame is, when it happens
and how it is viewed; everything else renders through it. All of it is pure and tested, so the
size the dialog quotes before you commit is the size the worker actually produces.

```ts
exportSize(longEdge, doc, pitchView): Size        // even on both axes — see D28
exportView(doc, size, pitchView): RenderView      // interactive: false, nothing else differs
frameCount(seconds, fps): number                  // covers [0, duration), never duration itself
```

Frames stop short of `duration` deliberately: the timeline always ends on a hold, so a frame at
exactly `duration` repeats the one before it — a wasted frame in an MP4 and a visible stutter at
the seam of a looping GIF.

### The worker

`src/export/worker.ts` owns the loop. The main thread posts one `ExportRequest` and receives
progress; there is no shared state and no second copy of the document.

```ts
const source = new CanvasSource(offscreen, { codec, quality: new Quality({ bitrate }) })
output.addVideoTrack(source, { frameRate: fps })
await output.start()

for (let i = 0; i < frames; i++) {
  drawBoard(ctx, doc, frameTime(i, fps), view)
  await source.add(frameTime(i, fps), 1 / fps)   // awaited: respects encoder backpressure
}
await output.finalize()
```

Because this is an `OffscreenCanvas` in a worker there is no compositor to wait on — no
`requestAnimationFrame` sync, and no frame can be captured stale. That is the whole reason export
lives off the main thread, and it is why a 19.5 s clip encodes at 1920x1318/60 in about 7 s.

**Cancelling is termination**, not a cooperative flag. The encode loop is a tight synchronous run
in a thread of its own, so killing the scope takes the `VideoEncoder` and the `OffscreenCanvas`
with it and leaves nothing to leak. `client.ts` terminates on cancel, on error, on completion and
on unmount, and is safe to call twice.

The finished file is **transferred**, not cloned — a 1080p60 clip is tens of megabytes.

### Format ladder

Resolved at runtime through mediabunny's codec-capability check, never by user-agent sniffing.
The check depends on the dimensions, so it is re-asked when the resolution changes: a machine
that encodes 720p H.264 may refuse 4K. `capability.ts` imports it dynamically, keeping the
encoder out of the main bundle — the dialog is the only thing that ever asks.

| Format | Codec | Availability |
|---|---|---|
| MP4 | H.264 (avc) | Chrome, Edge, Safari 16.4+, Firefox 130+ desktop |
| WebM | VP9, then VP8 | where AVC encoding is unavailable |
| GIF | `gifenc` | universal |

GIF is a **first-class choice in the export dialog**, not a downgrade path — it is the format that
actually pastes into a group chat. It needs one palette for the whole animation; see D29 for how
it is built and why it is not the board's named colours.

**A GIF delay is a whole number of centiseconds.** At 30 fps every frame rounds 33.3 ms down to
30 ms and a ten-second animation finishes a second early. `gifDelays()` takes differences of
rounded cumulative times instead, so the error stays inside the frame it belongs to rather than
accumulating; the offered rates divide 100 exactly, and 50 is the ceiling because browsers clamp
anything faster to 10 fps.

### PNG

`src/export/image.ts`, main thread — one frame needs no worker, and staying here means it works
without `OffscreenCanvas` too. Exports whatever frame the scrubber sits on, through the same
`exportView`, so the still and the video agree by construction. Rendering at 3840 and downscaling
to 960 matches a native 960 render, which is what "line weights scale proportionally" means in
practice: font sizes derive from `view.scale` rather than being fixed in pixels.

## 10. Persistence and sharing

Snapshots are **immutable**. Publishing mints a new id; opening a link gives you a fork. This
removes edit authorisation from the system entirely, and it matches what sharing a tactic
actually means — you are sending someone a position, not granting write access.

Three layers:

1. **Work in progress** — autosaved to `localStorage` (`share/local.ts`, debounced: a drag emits
   a document per pointermove and a `localStorage` write is synchronous on the main thread), plus
   explicit `.json` import/export, plus **squad presets** (`share/presets.ts`) — a named library
   of one-team setups, reusing `setupTeamSchema` so a preset and a hand-written setup file are the
   same shape. See D30 and D31. The library is the browser's only while nobody is signed in:
   signed in it is the account's, one row per preset, and `lib/usePresets.ts` is the seam that
   picks between the two. There is never one of each (D46).
   The JSON half shipped early, in `src/share/json.ts`. It accepts two shapes, told apart by
   `version`: a whole `BoardDoc`, and a much shorter **setup** document naming a formation, an
   eleven and its units. A setup is built into a board and then validated *as* a board, so
   nothing reaches the editor the schema would reject. Link members in a setup are shirt
   numbers, resolved once the squad exists; a side that lists links replaces the ones its
   formation seeded, and a side that says nothing keeps them.
2. **Self-contained link** — `#d=<base64url(deflate(json))>` using the native `CompressionStream`.
   No backend, works offline, survives the API being down. Used whenever the result fits the URL
   length budget.
3. **KV share** — for anything larger.

### Worker API

| Route | Behaviour |
|---|---|
| `POST /api/boards` | zod-validate, reject > 256 KB, store under a generated short id, return `{ id }` |
| `GET /api/boards/:id` | return the stored doc, `404` if absent |
| `GET /*` | static asset passthrough for the SPA |

The Worker imports the same `schema.ts` the app uses, so the client and the server cannot
disagree about what a valid document is.

Guards: size cap, zod validation, and a Cloudflare rate-limiting binding on `POST`. The binding
constraint is the free KV tier's **1k writes/day** — reads are 100k/day and will not be the
limit. Protect writes accordingly.
