# Pitchboard — Architecture

Reference for the engine; read before touching `src/board/`. Why: [`decisions.md`](decisions.md).
What breaks: [`AGENTS.md`](../AGENTS.md).

## 1. The core rule

**The renderer is a pure function of `(document, time, view)`.**

```ts
drawBoard(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
          doc: BoardDoc, t: number /* seconds */, view: RenderView): void
```

No DOM, React, module-level state, `Date.now()` or `Math.random()`. Same arguments, same pixels,
any thread:

```
              drawBoard(ctx, doc, t, view)   src/board/render.ts
                 ┌────────────┴─────────────┐
     EDITOR (main thread)            EXPORTER (Web Worker)
     <canvas> + rAF, hit-testing     OffscreenCanvas, t = 0…duration at 1/fps
     React chrome around it          → mediabunny / gifenc
```

Export runs offline, faster than realtime, dropping nothing; preview and export cannot diverge.
A value the renderer wants belongs in `BoardDoc` or `RenderView`. Caches are only caller-owned
memos that change no pixel (`RenderView.turf`).

## 2. Coordinates

Document coordinates are **board units**, origin top-left, `x` along the length: metres on a
football pitch, every other court scaled to the same 105-unit length; `sportOf(doc).metresPerUnit`
turns a unit back into metres wherever a person reads a distance (D113). `Viewport` (`scale` in CSS
px per unit, offsets, `rotated`, `half`) maps units to screen as one affine matrix (`viewMatrix`);
`toPitch` converts a pointer once and all hit maths happens in units. `fitViewport` derives the
viewport from the box alone, so a board renders identically at any size.

`RenderView` = `Viewport` + canvas size + what the editor wants drawn (selection, hover, marquee,
draft, guides, ruler, ghosts, trail, caption, `interactive`). Export passes `interactive: false`,
which only removes chrome. `transparent` leaves the surround unpainted — a transparent PNG, and
the editor, viewer and landing page, where the page is the ground around the board.

**Device pixel ratio** lives in the canvas transform, never in `Viewport.scale`.

Football's IFAB dimensions are one table in `src/board/pitch.ts`, never inlined: pitch 105 × 68;
goal 7.32 wide, drawn 2.0 deep; six-yard box 5.5 × 18.32; penalty area 16.5 × 40.32; spot 11.0;
arc and centre circle r 9.15; centre spot 0.3; corner arc 1.0; lines 0.12. Other courts are in
their own files in their rulebook's metres.

## 3. Document

`src/board/types.ts` is the schema, documented field by field; `schema.ts` is the zod validator
the app and Worker share. New boards come from `createBoardDoc()` in `src/formations/`.

```
BoardDoc   version, name, sport?, pitch, tokenScale?, flow?, grass?, origin?
  teams    [Team, Team]    id, name, color, textColor, pattern?, keeper?, formation? | shape?,
                           hidden?, players: { id, number, label }[]
  scenes   Scene[] (≥1)    id, name, note?, transitionMs, holdMs,
                           positions  id → Vec2        (every player, every scene)
                           paths      id → curve       (the run INTO this scene)
                           carrier | ballPos, ballPath, shot?, loft?
                           travel?, delay?, run?, hiddenRuns?, highlight?, spotlight?, unseen?
  links    Link[]          members (ordered), style, line?, arrows?, animate?, color?, from?, to?, lit?
  annotations? Annotation[] kind-tagged shapes with from/to scene ids, color, hidden?, lit?
```

- **Absent means the old behaviour**, so a new optional field needs no migration and every
  published link still opens. A real migration bumps `version`; `migrate.ts` converts before
  validation.
- **Paths live on the scene travelled into**: scene *i*'s `paths[e]` gets *e* from *i-1* to *i*,
  so deleting a scene cannot orphan one.
- Invariants that render wrong rather than crash: every scene positions every player; a carrier
  is a real player and never coexists with `ballPos`; a link has ≥2 real members; ranges name
  real scene ids.

## 4. Timeline

Scene 0 contributes its hold; every later scene a transition, then a hold.

```
 ├─ s0.hold ─┼─ s1.transition ─┼─ s1.hold ─┼─ s2.transition ─┼─ s2.hold ─┤
```

`sceneTimings(doc)` is the one source of each scene's length — a transition stretches to the
latest `delay + travel` in it; flow mode replaces all of it with one pace (D14).
`resolveAt(doc, t)` returns:

```ts
type Resolved = {
  from: Scene; to: Scene  // equal during a hold
  u: number               // 0..1, exactly 1 during a hold
  moving: boolean
  index: number           // index of `to` — what ranges and highlights switch on
  ms?: number             // absolute time; styled runs move during holds (D14)
}
```

`t` is clamped, so scrubbing past either end never yields NaN. No path: `lerp` on the ease. A
path: the cubic bezier at `s(ease(u))`. Default ease `easeInOutCubic`; run styles are Hermite
eases placed by `ms`.

**Arc-length reparameterisation.** Uniform `u` on a cubic surges and stalls. `geometry.ts`
samples 64 chords into a cumulative table and inverts it by binary search. Not cached (~2,000
flops per curve; a cache is mutable state on the render path). Tested numerically: chord ratio
within 1.05× after, over 1.5× before.

## 5. The ball

Derived, not stored, while carried. **A pass is a carrier change.**

| `from.carrier` → `to.carrier` | Behaviour |
|---|---|
| `A → A` | Glued ahead of A along his travel — a dribble; no ball line |
| `A → B` | Pass, along `ballPath` if drawn |
| `A → null` / `null → B` | Loose to `to.ballPos` / collected from `from.ballPos` |
| `null → null` | Free, `ballPos` to `ballPos` |

A ground pass decelerates (`easeOutQuad`), a lofted one does not. `passEnds` samples release and
arrival once each, and the ball and its line both read it (D44).

## 6. Links

Recomputed every frame from members' interpolated positions —
`linkGeometry(link, resolved, doc) → { points, closed, edges: { a, b, metres }[] }`. `chain` is an
open polyline in member order and never closes; `polygon` closes; `filled` adds a fill that
visibly stretches. `showDistances` labels edges in metres, upright. Scene ranges are `range.ts`,
shared with annotations and owned by neither (D47).

## 7. Renderer

Flat draw order:

```
 1. surface, goals, team names        8. ball
 2. zones (lit glow under each)       9. marks — arrows, lines, freehand, drawn balls
 3. links + distance labels          10. spotlight darkness, lit things cut out
 4. trail, run paths, ball line      11. text labels, always above it
 5. ghosts of other scenes           12. editor chrome (interactive only)
 6. halos and pools, every entity    13. caption, screen space
 7. tokens
```

Hit-testing walks it in reverse: a zone loses a click to a player in it; an arrow wins one.

**3D.** `projection.ts` builds one camera (`cameraFor`) for renderer and hit tests. The ground is
drawn flat into an OffscreenCanvas and warped strip by strip (`warpGround`) — perspective is not
affine. Depth shading goes on `source-atop`, so it darkens only what is painted. Standing things
(tokens, ball, halos, text, drawn balls) are billboards at projected points, far goal before,
near goal after; the darkness is screen-space over both.

## 8. Interaction

`src/board/interaction.ts`, hand-rolled, in board units.

| Target | Test |
|---|---|
| Token / ball | distance to centre < scaled radius |
| Curve handle | distance to point, only when its entity is selected |
| Link edge | point-to-segment, only on otherwise empty grass |
| Mark / zone | near the stroke, above tokens / inside or near the edge, below tokens |
| Annotation handle | selected shape only, tested first |
| Text label | its box in its own upright axes (`rotated`) |

Selection is a `Set` of ids; shift toggles, a marquee adds. A drag moves every selected entity by
one delta and carries into later scenes by D41. Snapping draws guides; ⌘/Ctrl places freely.
Under the camera every point is unprojected first (`pointFrom`, checked by `onGrass`); grass
things use the flat tests, standing things `unbillboard` (D91). Undo (`lib/history.ts`) keeps
whole-document snapshots, coalesced by a gesture key (D26).

## 9. Export

`src/export/frame.ts` is the one seam for size, timing and view, so the size quoted is the size
produced:

```ts
exportSize(longEdge, doc, pitchView, shape): Size   // even on both axes (D6)
exportView(doc, size, pitchView, look): RenderView  // interactive: false; caption, transparency
frameCount(seconds, fps): number                    // covers [0, duration)
```

Frames stop short of `duration`, which repeats the last hold and would stutter a looping GIF.
The worker (`export/worker.ts`) owns the loop — `drawBoard`, then an awaited `source.add` that
respects backpressure; the file is transferred, not cloned; cancelling terminates it. Formats by
mediabunny's capability check, loaded dynamically: MP4 (H.264), else WebM (VP9, VP8); GIF through
`gifenc`, one palette per clip. PNG (`image.ts`) is the scrubber's frame on the main thread
through the same `exportView`.

## 10. Persistence and sharing

1. **Work in progress** autosaves to `localStorage` (`share/local.ts`) through `share/storage.ts`,
   which validates every read and never throws (D31). Boards go in and out as `.json` — a whole
   `BoardDoc`, or a **setup** (formation + XI) built and validated as one (D23).
2. **Share links** — `#d=<base64url(deflate-raw(json))>`, opened read-only in the Viewer, with
   fork as the way out (D7).
3. **Accounts** (D39) — boards in projects in D1, mutable. Publishing mints `/share/<slug>`, which
   follows the board's edits, unlike `#d=`. Squad presets and drawn formations follow the account.

### Worker API

`worker/index.ts` answers `/api/*`; static assets are served ahead of it. It imports the same
`schema.ts`, so client and server agree on a valid document.

| Routes | |
|---|---|
| `GET/DELETE /api/me`, `POST /api/auth/logout` | session; erasure (D110) |
| `POST /api/auth/{register,verify,login,reset/request,reset}` | email and password (D109) |
| `GET /api/auth/google/{start,callback}` | Google sign-in |
| `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id` | the project tree (D39, D114) |
| `GET/POST /api/projects/:id/boards`, `GET/PATCH/DELETE /api/boards` | boards in a project; bulk move, delete |
| `GET/PUT/PATCH/DELETE /api/boards/:id`, `POST /api/boards/:id/copy` | one board |
| `POST/DELETE /api/boards/:id/publish`, `GET /api/shares/:slug` | live share link |
| `GET/POST /api/presets`, `PUT/DELETE /api/presets/:id` | squad presets (D30) |
| `GET/POST /api/formations`, `PUT/DELETE /api/formations/:id` | drawn formations (D122) |
| `POST /api/usage` | anonymous daily counters, the one unauthenticated write (D119) |
| `GET /api/admin/{stats,users/:id}`, `DELETE /api/admin/users/:id` | operator view; 404 to anyone else (D108) |

Writes are size-capped (`MAX_DOC_BYTES`, 256 KB) and zod-validated. Projects nest as an
adjacency list; cycle and depth guards and every walk's row bound live in `worker/lib/boards.ts`.

## 11. The importer

`src/import/` turns a `football-tracks` `tracks.json` into a board: `tracks.ts` is the contract,
`reduce.ts` the numerical half (fragments, runs, roster, possession), `index.ts` what becomes a
player and a scene. Rules: D52, D71, D73, D75, D81, D87, D88. Judged with `pnpm board`.
