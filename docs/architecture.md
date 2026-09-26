# Pitchboard — Architecture

Technical reference for the board engine. Read this before touching `src/board/`. The reasoning
behind each choice is in [`decisions.md`](decisions.md); what breaks when it is ignored is in
[`AGENTS.md`](../AGENTS.md).

---

## 1. The core rule

**The renderer is a pure function of `(document, time, view)`.**

```ts
drawBoard(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
          doc: BoardDoc,
          t: number,           // seconds from timeline start
          view: RenderView): void
```

No DOM, no React, no module-level mutable state, no `Date.now()` or `Math.random()`. The same
arguments emit the same pixels in any thread:

```
                    ┌──────────────────────────────┐
                    │  src/board/render.ts         │
                    │  drawBoard(ctx, doc, t, view)│
                    └──────────────┬───────────────┘
                    ┌──────────────┴───────────────┐
                    ▼                              ▼
        EDITOR (main thread)            EXPORTER (Web Worker)
        <canvas> + rAF loop             OffscreenCanvas
        pointer hit-testing             t = 0 … duration, step 1/fps
        React chrome around it          → mediabunny / gifenc
```

The exporter renders offline, faster than realtime, dropping no frames, and preview/export
divergence is structurally impossible. If `render.ts` wants something from the DOM, a ref or a
hook, that value belongs in `BoardDoc` or `RenderView`. Caches are allowed only as memos the
caller owns (`RenderView.turf`) that change no pixel.

---

## 2. Coordinates

All document coordinates are **pitch metres**, origin at the top-left corner, `x` along the
length, `y` across. `Viewport` (`scale` in CSS px per metre, offsets, `rotated`, `half`) maps
metres to the screen as one affine matrix (`viewMatrix`); `toPitch` turns a pointer event into
metres once and all hit maths happens there. `fitViewport` derives it purely from the box size,
so the same document renders identically at any canvas size.

`RenderView` is `Viewport` plus the canvas size and everything the editor wants drawn —
selection, hover, marquee, draft, guides, ruler, ghosts, trail, caption, `interactive`. Export
passes `interactive: false`, which only ever removes chrome.

**Device pixel ratio** lives in the canvas transform (`ctx.setTransform(dpr, …)`) and never in
`Viewport.scale`; the exporter renders at an explicit size and ignores it.

### Pitch dimensions

Real IFAB dimensions, in one table in `src/board/pitch.ts` and never inlined.

| Feature | Value (m) |
|---|---|
| Pitch | 105 × 68 |
| Goal width / drawn depth | 7.32 / 2.0 |
| Six-yard box | 5.5 deep × 18.32 wide |
| Penalty area | 16.5 deep × 40.32 wide |
| Penalty spot | 11.0 from goal line |
| Penalty arc / centre circle radius | 9.15 |
| Centre spot / corner arc radius | 0.3 / 1.0 |
| Line width | 0.12 |

---

## 3. Document

`src/board/types.ts` is the single source of truth, documented field by field;
`src/board/schema.ts` is the zod validator the app and the Worker both import. A new board comes
from `createBoardDoc()` in `src/formations/` because a board is formation-driven.

The shape, in brief:

```
BoardDoc   version 1, name, pitch, tokenScale?, flow?, grass?, origin?
  teams    [Team, Team]    id, name, color, textColor, pattern?, keeper?, formation?, hidden?,
                           players: { id, number, label }[]
  scenes   Scene[] (≥1)    id, name, transitionMs, holdMs,
                           positions  id → Vec2        (every player, every scene)
                           paths      id → curve       (the run INTO this scene)
                           carrier | ballPos, ballPath, shot?, loft?
                           travel?, delay?, run?, hiddenRuns?
                           highlight?, spotlight?, unseen?
  links    Link[]          members (ordered), style, line?, arrows?, animate?, color?, from?, to?, lit?
  annotations? Annotation[] kind-tagged shapes with from/to scene ids, color, hidden?, lit?
```

**Everything optional means its absence is the old behaviour**, so a new field needs no
migration and every published link still opens. Where a real migration is owed, `version` bumps
and `src/board/migrate.ts` converts on load, before validation.

**Paths are stored on the scene being travelled into.** Scene *i*'s `paths[e]` is how *e* gets
from scene *i-1* to scene *i*, so deleting a scene cannot orphan a path.

Schema invariants worth knowing, because a violation renders wrong rather than crashing: every
scene has a position for every player; a carrier is a real player and never coexists with
`ballPos`; link members are real players, at least two; ranges name real scene ids.

---

## 4. Timeline

Scene 0 contributes only its hold; every later scene a transition then a hold.

```
 ├─ s0.hold ─┼─ s1.transition ─┼─ s1.hold ─┼─ s2.transition ─┼─ s2.hold ─┤
```

`sceneTimings(doc)` is the one source of what each scene is worth — a transition stretches to
the latest `delay + travel` of anyone in it, and flow mode replaces all of it with a single pace
(D14). `resolveAt(doc, t)` walks the segments and returns:

```ts
type Resolved = {
  from: Scene; to: Scene   // equal during a hold
  u: number                // 0..1, exactly 1 during a hold
  moving: boolean
  index: number            // index of `to` — what ranges and highlights switch on
  ms?: number              // absolute time; styled runs move during holds (D14)
}
```

`t` is clamped, so scrubbing past either end never produces NaN.

**Positions.** No path: `lerp` on the ease. A path: the cubic bezier at `s(ease(u))`, endpoints
from the two scenes, controls from the path. Default ease is `easeInOutCubic`; run styles are
Hermite eases, placed by `ms`.

### Arc-length reparameterisation

A cubic sampled at uniform `u` does not move at uniform speed — players surge and stall through
curves. `geometry.ts` samples 64 chord lengths, normalises them to a cumulative table, and inverts
it by binary search, so the bezier is evaluated at `s(d)` rather than `d`. It is deliberately not
cached: ~2,000 flops per curve is nothing, and a cache is mutable state on the renderer's path.
The test asserts constant speed numerically (chord lengths within 1.05x after, over 1.5x before).

---

## 5. The ball

The ball is derived, not stored, while carried. **A pass is a carrier change.**

| `from.carrier` → `to.carrier` | Behaviour |
|---|---|
| `A → A` | Glued ahead of A along his travel — a dribble; no ball line |
| `A → B` | Pass, along `ballPath` if drawn |
| `A → null` | Loose, to `to.ballPos` |
| `null → B` | Collected, from `from.ballPos` |
| `null → null` | Free, `ballPos` to `ballPos` |

A ground pass decelerates (`easeOutQuad`), a lofted one does not. The ball has its own wait and
travel: `passEnds` samples the release (the passer wherever he has run) and the arrival (the
receiver wherever he is then) once each, and both the ball and its line read it (D44).

---

## 6. Links

A link is recomputed every frame from its members' interpolated positions:

```ts
linkGeometry(link, resolved, doc): { points: Vec2[]; closed: boolean; edges: { a; b; metres }[] }
```

`chain` is an open polyline in member order and must never close; `polygon` closes it; `filled`
adds a translucent fill whose area visibly compresses and stretches. `showDistances` labels each
edge in metres, upright. A link's scene range lives in `range.ts`, shared with annotations and
owned by neither (D47).

---

## 7. Renderer

### Draw order, flat board

```
 1. pitch, goals, team names         (pitch.ts)
 2. zones                            background; each lit one's glow just under it
 3. links + distance labels          under the tokens, so numbers stay legible
 4. trail, run paths, ball line      paths only while moving or selected
 5. ghosts of other scenes
 6. halos and pools                  one pass for every entity, before any token
 7. tokens
 8. ball
 9. marks — arrows, lines, freehand, drawn balls
10. the spotlight's darkness         pools, lit shapes and `lit` drawings cut out of it
11. text labels                      above the darkness, always
12. editor chrome                    selection, handles, marquee, guides, ruler — interactive only
13. caption                          screen space
```

Hit-testing walks the same order in reverse, so a zone loses a click to a player standing in it
and an arrow wins one.

### The 3D view

`projection.ts` builds one camera (`cameraFor`) used by the renderer and every hit test. The
ground — everything that lies on the grass — is drawn flat into an OffscreenCanvas and warped
strip by strip (`warpGround`), since perspective is not an affine transform. Everything standing
— tokens, ball, halos, text, drawn balls — is drawn afterwards as billboards at their projected
points, the far goal before and the near goal after. The darkness is applied in screen space
over both.

---

## 8. Interaction

`src/board/interaction.ts`, hand-rolled and in pitch metres.

| Target | Test |
|---|---|
| Token / ball | distance to centre < scaled radius |
| Curve handle | distance to point, only when its entity is selected |
| Link edge | point-to-segment distance |
| Mark | distance to the sampled stroke, above tokens |
| Zone | inside the shape (filled) or near its edge (outline), below tokens |
| Annotation handle | only for the selected shape, tested first |
| Text label | its box in its own upright axes (`rotated`) |

Selection is a `Set` of ids; shift toggles, a marquee adds. A drag applies one delta to every
selected entity, and carries it into following scenes by the rule in D41. Snapping (`snapPoint`,
`snapLabel`) draws guides across the pitch; ⌘/Ctrl places freely.

**Under the camera** every pointer point is unprojected to metres first (`pointFrom`, checked by
`onGrass`). Things on the grass are tested with `unprojectPitch` and the flat tests; things
standing are tested with `unbillboard` in the space they were drawn in (D91).

**Undo** (`src/lib/history.ts`) keeps whole-document snapshots outside the document, coalesced by
an explicit gesture key (D26).

---

## 9. Export

`src/export/frame.ts` is the one seam every consumer renders through — size, timing and view —
so the size the dialog quotes is the size produced.

```ts
exportSize(longEdge, doc, pitchView, shape): Size   // even on both axes (D6)
exportView(doc, size, pitchView, look): RenderView  // interactive: false; caption, transparency
frameCount(seconds, fps): number                    // covers [0, duration)
```

Frames stop short of `duration`: the timeline ends on a hold, so that frame would repeat the one
before it and stutter a looping GIF.

**The worker** (`src/export/worker.ts`) owns the loop: one `ExportRequest` in, progress out, the
finished file transferred rather than cloned. Each frame is `drawBoard` then an awaited
`source.add`, which respects encoder backpressure. No compositor, so nothing is captured stale.
Cancelling terminates the worker.

**Formats** are chosen by mediabunny's capability check for the requested size, loaded
dynamically so the encoder stays out of the main bundle: MP4 (H.264), else WebM (VP9, VP8); GIF
through `gifenc` is a first-class choice, with one palette for the whole clip. **PNG**
(`image.ts`) is the scrubber's frame, on the main thread, through the same `exportView`.

---

## 10. Persistence and sharing

1. **Work in progress** is autosaved to `localStorage` (`share/local.ts`, debounced) through
   `share/storage.ts`, which validates every read and never throws (D31). Boards also go out and
   in as `.json` — a whole `BoardDoc`, or a short **setup** naming a formation and an XI that is
   built into a board and validated as one (D23).
2. **Share links** — `#d=<base64url(deflate-raw(json))>`, decoded by the page, opened read-only
   in the Viewer with one way out: fork (D7).
3. **Accounts** (D39) — signed in, boards live in projects in D1 and are mutable. Publishing
   one mints a `/share/<slug>` that points at the board and follows its edits, unlike `#d=`
   (D7). Squad presets follow the account (D30).

### Worker API

`worker/index.ts` answers `/api/*`; static assets are served ahead of it. It imports the same
`schema.ts`, so client and server cannot disagree about a valid document.

| Routes | |
|---|---|
| `GET /api/me`, `POST /api/auth/logout`, `GET /api/auth/google/{start,callback}` | session and Google sign-in |
| `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id` | the project tree (D39) |
| `GET/POST /api/projects/:id/boards`, `GET/PATCH/DELETE /api/boards` | boards in a project; bulk move and delete |
| `GET/PUT/PATCH/DELETE /api/boards/:id`, `POST /api/boards/:id/copy` | one board |
| `POST/DELETE /api/boards/:id/publish`, `GET /api/shares/:slug` | a board's live share link; the one route with no session |
| `GET/POST /api/presets`, `PUT/DELETE /api/presets/:id` | squad presets (D30) |

Every write is size-capped (`MAX_DOC_BYTES`, 256 KB) and zod-validated. Projects nest as an
adjacency list; the cycle and depth guards and every recursive walk's row bound live in
`worker/lib/boards.ts`.

---

## 11. The importer

`src/import/` turns a `tracks.json` from the sibling `football-tracks` into a board: `tracks.ts`
is the contract, `reduce.ts` the numerical half (fragments, runs, the roster, who has the ball),
`index.ts` what becomes a player and a scene. Its rules are D52, D71, D73, D75, D81, D87, D88;
`pnpm board` is how a change is judged.
