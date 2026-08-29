# Pitchboard — animated football tactics board

Working conventions for this repo. Architecture detail lives in
[`docs/architecture.md`](docs/architecture.md), the build order in
[`docs/implementation-plan.md`](docs/implementation-plan.md), and the reasoning behind every
choice in [`docs/decisions.md`](docs/decisions.md).

## Mission

A browser tactics board where a coach draws a formation, moves players between scenes along
curved runs, and exports the result as MP4, GIF, or PNG. Everything renders client-side; there
is no server-side video pipeline and there will not be one.

The differentiating feature is **live links** — a connector between a group of players that is
recomputed every frame from their interpolated positions, so the shape deforms as they move
independently. Build for that; it is what the reference tools do badly.

## The two invariants

Everything else is negotiable. These are not.

1. **`drawBoard` is pure.** No DOM, no React, no `Date.now()`, no `Math.random()`, no
   module-level mutable state. Given `(doc, t, view)` it emits the same pixels in any thread.
   If the renderer needs a value, that value belongs in `BoardDoc` or `Viewport` — there is no
   third source of truth. Breaking this breaks export fidelity, and the symptom shows up far
   from the cause.

2. **No pixels in the document.** All coordinates are pitch metres on a 105 × 68 pitch.
   `Viewport` converts at the edges; `devicePixelRatio` lives in the canvas transform and never
   in `Viewport.scale`. Breaking this shows up as players drifting on window resize or on a
   retina display.

## Hard decisions — do not relitigate without asking

- **No canvas library.** Konva and SVG were both considered and rejected. A scene graph between
  the code and the pixels is exactly where preview/export divergence comes from. Hit-testing is
  hand-rolled and small.
- **Scenes with per-transition paths**, not pure keyframes and not a pure Gantt of paths.
- **A pass is a carrier change** (`scene.carrier`), not a separate object type.
- **`mediabunny`**, not `mp4-muxer`/`webm-muxer` (deprecated) and not `MediaRecorder` (realtime,
  drops frames).
- **Immutable share snapshots.** No accounts, no edit keys, no authorisation model.
- **OpenTofu owns durable infra; wrangler owns the deploy.** Do not add
  `cloudflare_workers_script` to the stack.

## Non-goals for v1 — do not build

Real player data and autocomplete, cones, thirds views, touch support, heatmaps, custom domain.
All are deliberate deferrals with reasoning in `docs/decisions.md`.

The drawing toolkit was one of these and is no longer — annotations shipped in M7, and half-pitch
shipped early. See D20.

## Repository layout

```
docs/                     architecture, implementation plan, decisions
src/board/                the engine — zero React, zero DOM
  types.ts                BoardDoc — single source of truth for the schema
  schema.ts               zod validator, shared with the Worker
  pitch.ts                IFAB dimensions table + markings
  geometry.ts             bezier, arc-length LUT, easing
  timeline.ts             (doc, t) → resolved positions, incl. ball carrier
  links.ts                connector geometry + distances
  annotations.ts          the coach's drawing — shapes, scene ranges, hit geometry
  render.ts               drawBoard() — the one renderer
  interaction.ts          hit-testing, drag, selection
src/formations/           preset shapes, each seeding its own links
src/export/               worker render loop, mediabunny, gifenc, PNG
src/share/                localStorage, URL-hash codec, API client
  storage.ts              the ONLY place localStorage is touched; never throws
  json.ts                 board and setup files in and out; owns setupTeamSchema
  presets.ts              named one-team squad presets, built on setupTeamSchema
  local.ts                autosave of the board in progress
src/components/           React chrome; ui/ holds shadcn-style primitives
worker/                   Cloudflare Worker — /api/boards + static passthrough
infrastructure/terraform/cloudflare/    OpenTofu stack
```

`src/board/types.ts` is the canonical schema, in the same spirit as `cv.ts` in `portfolio` and
`site.ts` in `motorcycle-journey`. Components never redefine document shape.

## Engineering conventions

- pnpm, Node >= 22.12. TypeScript strict.
- React 19 + Vite 8 + Tailwind v4, following `wtc/ui/` — its ESLint config and `components/ui/`
  primitives are directly reusable.
- Conventional Commits, enforced by commitizen in `commit-msg` and by CI on PRs. Use `cz commit`.
- `pre-commit install` after cloning. The eslint/typecheck hooks self-activate once `.ts` files
  exist.
- Tests are Vitest, engine only — no component tests. The engine is pure numerical code where
  tests are cheap and load-bearing.
- Match the surrounding style. Do not refactor beyond the task.

## Known traps

- **Arc-length reparameterisation.** A cubic bezier sampled at uniform `u` does not move at
  uniform speed — players visibly surge and stall through curves. Build the 64-sample LUT and
  invert it. Test numerically, not by eye.
- **Pass endpoints must be evaluated live.** Target the receiver's *interpolated* position, not
  their final scene position, or the ball flies to where they will be and jumps on arrival.
- **`scenes[0].transitionMs` is meaningless** — there is nothing to travel from. Guard it in the
  timeline maths or the first segment gets double-counted.
- **Annotations are not links.** A link has no geometry and is recomputed every frame from its
  members; an annotation is fixed geometry that depends on nobody. Do not merge them.
- **An annotation's scene range is stored as scene ids**, never indices — reordering scenes must
  carry the drawing with them. `deleteScene` prunes dangling ranges rather than dropping shapes.
- **Formation slots pair by ORDER, not by id.** `buildTeam` mints `<team>-<number>` ids, but
  renumbering a player keeps their id — so after a renumber those ids no longer match the squad.
  Anything mapping a fresh build onto an existing team walks both lists by index.
- **A field that validates on every keystroke blocks the value you are typing.** Renumbering a
  7 to 12 passes through 1 on the way, so refusing a taken 1 refuses the edit before the second
  digit exists. Retyping a pace of 10 as 20 is worse: it passes through the empty string, which
  no document can hold, so a fully controlled input snaps back mid-edit. Every numeric field
  holds its own text, commits only what is valid, and restores on blur — `NumberField` in
  `Timeline.tsx` and the label-size field in `DrawPanel.tsx`.
- **Two players on one shirt share an id**, since an id is `<team>-<number>`, and the second
  overwrites the first in every scene's positions. A formation's own numbers never collide; a
  squad carried into a new shape can. `buildTeam` moves the loser to the lowest free shirt —
  but the setup importer still REJECTS duplicates a file states outright. Reject what was
  written wrong, resolve what was left to us (D32).
- **A formation change keeps the squad and drops that side's links** (D32). Seeded links are
  appended, so keeping the old ones stacks a stale connector under the new one. Link ownership
  is read from the OLD team: a carried squad keeps its ids, so the prune would not catch them.
- **In flow mode the timings are derived from the positions**, so any edit retimes the
  animation and slides the scrubber into the middle of a transition. The board then draws
  interpolated positions — a dragged player lags the cursor — while the edit lands on the scene
  you think you are looking at. Re-pin the scrubber to the selected scene on every change.
- **Zero holds is not seamless.** `easeInOutCubic` starts and ends at zero velocity, so removing
  the holds still leaves every player stopping dead at each scene boundary. Flow mode is linear
  for that reason — see D27.
- **`Scene.shot` must not outlive the travel it describes.** It marks the ball's arrival, so
  setting a carrier invalidates it on that scene AND the next, and deleting or reordering a scene
  invalidates it for a neighbour. `pruneShots` runs inside `replace` for that reason. `canShoot`
  is the only rule for whether a strike is possible — gate and flag disagreeing is what let one
  go stale (D24).
- **A dribble is not a pass.** The ball is glued to its carrier, so it moves as far as they
  run. Anything deciding what the ball *did* must read the carrier change (`ballTravelBetween`),
  never the distance the ball covered.
- **An arrowhead only hides what is inside it.** The head is a triangle narrowing to the tip, so
  a shaft drawn all the way to that tip emerges from under it wherever the triangle gets narrower
  than the shaft is wide. On a shot that is two rails appearing to overshoot the arrow and run on
  to the ball. The shaft stops inside the head instead (`SHAFT_INTO_HEAD`).
- **The ball's line is sampled from `ballAt`, not guessed.** Endpoints come from the function
  that actually moves the ball, at `u=0` and `u=1`, so carrier glue and travel overrides are
  included rather than reimplemented.
- **A drag emits a document per `pointermove`.** Anything recording document history has to be
  told where the gesture ends, or one drag becomes forty undo steps — hence the merge key in
  `useHistory`. See D26.
- **Chains must not close.** A back 4 rendered as a closed polygon draws an edge across the
  width of the pitch. Member order is load-bearing for chains and polygon perimeters.
- **GIF palette shimmer.** Quantise once for the whole animation, never per frame, or the pitch
  greens crawl between frames. The palette comes from sampled frames rather than the board's
  named colours — antialiased edges and translucent fills are most of the picture (D29).
- **A GIF delay is a whole number of centiseconds.** Rounding each frame independently runs a
  30 fps clip a second short over ten seconds. Take differences of rounded cumulative times.
- **Export size follows the board's aspect, not 16:9** (D28), and both axes must be even or the
  H.264 encoder refuses the frame.
- **Cancelling an export is terminating the worker.** A cooperative flag cannot be read from
  inside a synchronous encode loop.
- **The penalty arc** is the part of a 9.15 m circle centred on the *penalty spot* that falls
  outside the box — not an arc on the box edge.
- **Anything read from `localStorage` is untrusted input** — it survives app versions and can be
  hand-edited in devtools. Validate it and discard what fails; never repair it (D31).
- **A stored preset names players by shirt number, never by id.** Ids are minted per board and a
  renumbered player keeps theirs, so an id in a file means nothing later (D30).
- **DPR double-application** looks correct on a 1× monitor and wrong everywhere else.

## Definition of done, per phase

See [`docs/implementation-plan.md`](docs/implementation-plan.md) — each phase carries its own
checklist. Two checks belong in every phase regardless:

- resize the window and confirm players do not move relative to the pitch
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

## Git

Never create branches, commits, or PRs unless explicitly asked. "Fix X" means prepare the
change, not commit it.
