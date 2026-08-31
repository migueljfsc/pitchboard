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
  `cloudflare_workers_script` to the stack. This is not a preference: deploying a Worker with
  static assets needs a completion JWT that Cloudflare expires after an hour, obtained by
  hashing and uploading `dist/` first, and Terraform can neither produce it nor hold it in
  state. CI deploys via `.github/workflows/deploy-worker.yml` (D40).

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
  links.ts                connector geometry + distances, and when a link shows
  range.ts                scene ranges — shared by links and annotations, owned by neither
  annotations.ts          the coach's drawing — shapes, scene ranges, hit geometry
  projection.ts           the 3D view — one fixed camera, and the ground warp
  render.ts               drawBoard() — the one renderer
  interaction.ts          hit-testing, drag, selection
src/formations/           preset shapes, each seeding its own links
src/export/               worker render loop, mediabunny, gifenc, PNG
src/share/                localStorage, URL-hash codec, API client
  storage.ts              the ONLY place localStorage is touched; never throws
  urlcodec.ts             #d= share links: deflate + base64url, and the budget
  json.ts                 board and setup files in and out; owns setupTeamSchema
  presets.ts              named one-team squad presets, built on setupTeamSchema
  local.ts                autosave of the board in progress
src/i18n/                 EN and PT; en.ts is the source of truth for the keys
  core.ts                 pure runtime — the engine imports only `Message` from here
src/App.tsx               picks Viewer or Editor from the hash; no router
src/pages/Viewer.tsx      read-only playback of a shared board, with fork
src/board/migrate.ts      version dispatch, run before validation on every load
src/components/           React chrome; ui/ holds shadcn-style primitives
worker/                   Cloudflare Worker — the API, and the SPA's static passthrough
  index.ts                the router; /api/* only, assets are served ahead of it
  lib/                    session, google, users, boards, presets, crypto, http, limits
  migrations/             D1 schema, applied by CI before the script is deployed
wrangler.jsonc            bindings and asset routing; the ONLY place a binding is declared
infrastructure/terraform/cloudflare/    OpenTofu — R2, D1, KV. Durable resources only
```

The Worker is application code and lives with the application, not under `infrastructure/`.
What *is* infrastructure is the deploy, and that is a workflow rather than a directory:
OpenTofu cannot own a Workers deploy (D40), so `.github/workflows/deploy-worker.yml` does.
`pnpm types` regenerates the ambient bindings; `pnpm deploy:worker` is a local dry-run escape
hatch, but CI owns the real deploy.

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
- **A link's range is optional at BOTH ends, and an annotation's is not.** Absent means the open
  end, so a link with neither shows on every scene — which is what every link written before
  ranges existed means, and why no migration was owed (D47). Anything treating a link's `from`
  as required makes those links vanish from every board already published. The rule lives in
  `range.ts` and not in `annotations.ts`: links must not import annotations, and `scenes.ts`
  cannot hold it because it imports `annotations.ts` and would close a cycle.
- **A highlight does NOT carry forward, and a position does** (D41 vs D47). A drag reaches into
  the scenes nobody meant anything by because a position stands until something changes it.
  Attention is about one moment; `setHighlight` touches the one scene it is given, and making it
  behave like a nudge would put a glow on scenes the coach never looked at.
- **The halo is a billboard, drawn in a pass of its own.** In 3D it goes through `billboard()`
  like everything else upright, or it lands as an ellipse squashed into the grass. And it is
  drawn for every entity BEFORE any token rather than beside its own — tokens overlap, so a halo
  drawn with its token sits on top of the neighbour drawn a moment earlier.
- **A text label is the one annotation that is not in pitch space.** It stays upright while the
  board turns, so on a vertical board its lines run along pitch y and stack along pitch x —
  which is why `boundsOf`, `annotationHandles`, `dragAnnotationHandle` and `hitTestAnnotation`
  all take `rotated`. It defaults to the flat case, so forgetting it fails quietly and only on
  a rotated board: the box, the width handle and the grab area sit ninety degrees off the words.
- **Formation slots pair by ORDER, not by id.** `buildTeam` mints `<team>-<number>` ids, but
  renumbering a player keeps their id — so after a renumber those ids no longer match the squad.
  Anything mapping a fresh build onto an existing team walks both lists by index.
- **A field that validates on every keystroke blocks the value you are typing.** Renumbering a
  7 to 12 passes through 1 on the way, so refusing a taken 1 refuses the edit before the second
  digit exists. Retyping a pace of 10 as 20 is worse: it passes through the empty string, which
  no document can hold, so a fully controlled input snaps back mid-edit. Every numeric field
  holds its own text, commits only what is valid, and restores on blur — use
  `components/ui/NumberField.tsx` rather than writing another one. `SizeField` in `DrawPanel.tsx`
  is the one remaining copy: it is an unlabelled inline variant for a toolbar row, and it also
  does not track a value changing underneath it.
- **Two players on one shirt share an id**, since an id is `<team>-<number>`, and the second
  overwrites the first in every scene's positions. A formation's own numbers never collide; a
  squad carried into a new shape can. `buildTeam` moves the loser to the lowest free shirt —
  but the setup importer still REJECTS duplicates a file states outright. Reject what was
  written wrong, resolve what was left to us (D32).
- **A formation change keeps the squad and drops that side's links** (D32). Seeded links are
  appended, so keeping the old ones stacks a stale connector under the new one. Link ownership
  is read from the OLD team: a carried squad keeps its ids, so the prune would not catch them.
- **A carry is judged scene-by-scene, never against the scene being edited.** A drag or a nudge
  applies its delta to every following scene the entity does not travel into (D41). Deciding that
  by comparing each scene to the EDITED one makes the boundary depend on a distance the edit is
  itself changing — a second nudge in the same direction then captures a scene the first stopped
  at. Compare each scene to the one before it and the boundary is stable under the carry.
- **A curve's controls are absolute pitch coordinates**, so an endpoint that moves without them
  warps the run. `c1` follows the start, `c2` follows the end, and both follow what the clamp
  ALLOWED rather than what was asked, or a token stopped by the touchline drags its curve past it.
- **A wait is not a shorter travel.** `Scene.delay` holds an entity at its start; `Scene.travel`
  changes how long its run takes. The window fits the latest `delay + travel`, not the longest
  single run (D42) — and flow mode ignores both, because everyone keeps step.
- **A ghost is drawn from the scene, not from a frame.** `RenderView.ghosts` names scene indices
  and the renderer reads their stored positions directly; only the ball needs `ballAt`, because a
  carried ball has no stored position. In 3D they go through `billboard()` like everything else
  upright, or they land squashed into the grass.
- **In flow mode the timings are derived from the positions**, so any edit retimes the
  animation and slides the scrubber into the middle of a transition. The board then draws
  interpolated positions — a dragged player lags the cursor — while the edit lands on the scene
  you think you are looking at. Re-pin the scrubber to the selected scene on every change.
- **Zero holds is not seamless.** `easeInOutCubic` starts and ends at zero velocity, so removing
  the holds still leaves every player stopping dead at each scene boundary. Flow mode is linear
  for that reason — see D27.
- **`Scene.shot` must not outlive the travel it describes.** It marks the ball's arrival, so
  setting a carrier invalidates it on that scene AND the next, and deleting or reordering a scene
  invalidates it for a neighbour. `pruneBallFlags` runs inside `replace` for that reason. `canShoot`
  is the only rule for whether a strike is possible — gate and flag disagreeing is what let one
  go stale (D24).
- **Giving the ball away carries forward.** `setCarrier` takes the same `Carry` a drag does: the
  handover reaches every following scene nothing happens to the ball in, because those scenes are
  still the kick-off nobody has said anything about yet (D43). `"all"` reaches no further than
  `"stationary"` — a handover has no delta to translate, so carrying past a pass could only
  overwrite it.
- **There is no ball until somebody is given it.** A scene has one when it names a carrier or
  stores a position, and a new board does neither — so `ballAt` returns `null` and the renderer,
  the hit-test and the ghosts all have to check (D44). A ball appearing for the first time appears
  on its new holder rather than travelling in, and arriving is not a travel, so it cannot be a
  shot. The schema's only rule is that a scene never holds both a carrier and a `ballPos`.
- **`Scene.loft` is the second flag on the same travel.** It lifts the ball off the ground
  and, like `shot`, means nothing where the ball does not fly — so `pruneBallFlags` asks
  each its own question (`canShoot` needs a loose travel, `canLoft` only a travel at all)
  and both can be set at once (D45). A lofted ball also drops `ballAt`'s `easeOutQuad`:
  the turf is what slows a ground pass, and leaving the deceleration in lands the ball
  beside the receiver at the top of its arc, where it hangs and then falls straight down.
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
- **A hash change does not reload the page.** Pasting a `#d=` link into a tab that already has
  Pitchboard open fires `hashchange` and nothing else, so anything reading the hash once at mount
  silently ignores the link. `replaceState` fires no event at all — clearing the hash in code has
  to update the state too (D33).
- **There is only ever ONE squad library.** Signed in it is the account's; signed out it is the
  browser's; nothing writes both (D46). A cache in `localStorage` "just in case", or an offline
  fallback that lets saving carry on locally, rebuilds the second library the whole design
  avoids — and the merge has no answer, because the same squad edited on two sides is two
  squads. That is also why adoption clears the local copy, and only once every preset landed.
- **Anything read from `localStorage` is untrusted input** — it survives app versions and can be
  hand-edited in devtools. Validate it and discard what fails; never repair it (D31).
- **A stored preset names players by shirt number, never by id.** Ids are minted per board and a
  renumbered player keeps theirs, so an id in a file means nothing later (D30).
- **Perspective cannot be a canvas transform.** `ctx.transform` is affine; a trapezoid is not.
  That is why the 3D view warps a flat ground layer instead of setting a matrix, and why nothing
  in `pitch.ts` had to learn about the camera (D34).
- **In 3D, metre space lands on the grass.** Anything new drawn inside the ground layer takes the
  perspective — which is usually right. Anything that must stay upright and unsquashed has to be
  added to the billboard pass explicitly; it will not get there by itself. Tokens, the ball and
  text annotations are the current list.
- **A billboard's axes are the screen's, not the pitch's.** Inside `billboard()` one unit is still
  a metre, but +y is down the frame however the board is oriented underneath. That is what makes a
  token a circle rather than an ellipse — and it means a pitch-space offset copied into there
  points somewhere else.
- **The 3D view has TWO interaction gates, not one** (D48, D49). `live` is any pointer input and
  the angled view has it, including moving players and shaping their runs; `canDraw` is the
  coach's DRAWING — making a shape, moving one, dragging its handles — and only the flat board
  has that. Collapsing them back into one is how the view ended up holding a selection it could
  not clear.
- **A label's handles are the one grab that stays flat** (D50). Everything else a coach draws is
  pitch geometry in the ground layer and warps with it, handles included. A text label is a
  billboard, so handles computed in pitch metres land nowhere near the words — which is what
  `drawAnnotationChrome`'s `handles` switch is for, and why the tilted path turns it off for text
  and on for everything else. Turning it on for text draws grab points on empty grass.
- **Above the horizon there is no ground, and `unproject` returns NaN.** One NaN reaching a delta
  puts NaN into a position and the board is gone. `onGrass` is checked once in `BoardCanvas`
  rather than in each of the six places a point is consumed — a drag holds where it was, and a
  gesture released up there commits from its last good move.
- **Under the camera, hit-testing splits the way drawing does.** Anything on the GRASS is tested
  by `unprojectPitch` and the ordinary flat tests; anything STANDING — token, ball, text label —
  is a billboard and is tested with `unbillboard`, in the space it was drawn in. Testing a token
  against the grass beneath it grabs an ellipse nowhere near the pixels, which is the objection
  that kept the view read-only in the first place.
- **The 3D draw order is not the flat one, so neither is the hit-test order.** Flat, marks sit
  above the tokens. Under the camera only TEXT does — the rest of its layer is in the ground
  image, under the players. `hitTestGroundAnnotation` exists to leave text out of that pass,
  because `hitTestTiltedText` has already had it.
- **There is ONE camera.** `cameraFor` is called by the renderer and by every hit test. Building
  a projection beside the pointer handling is a second answer to where a player is on screen, and
  the two drift exactly the way preview and export would.
- **Tilt implies a vertical board**, so `framingOf` forces it and the rotation control is disabled
  rather than left to disagree. Export follows: `boardAspect` returns the projected aspect, which
  for a full pitch is very nearly square (D34).
- **The goals are the only thing with a height**, and `project(sx, sy, up)` is the only way to get
  one. They are depth-sorted by being drawn at either end of the billboard pass — far goal before,
  near goal after — which is exact only because no player is ever outside the goal lines.
- **A goal with height eats the space behind it**, so the 3D view seats team names further out
  than the flat board does (`TEAM_NAME_OFFSET_3D`). The net's back edge reaches ~2.5 m up-screen
  from the goal line and the flat 4.3 m draws the name straight through it.
- **Tilt is never written to `PitchView.rotated`.** `framingOf` applies it at render time instead,
  so the flat orientation survives a trip through 3D. Setting it on the toggle would work and would
  quietly lose what the user had (D36).
- **The share link's framing rides BESIDE the payload**, in `v=`, never inside `BoardDoc` — no
  migration, and every link published before it still opens. The crop is the sharer's and the
  viewer cannot change it; rotation and 3D are the viewer's own (D35).
- **Anything added to `Team` must be carried through `TeamSpec`, at every site that builds one.**
  `buildTeam` mints the whole team object, so whatever the spec does not name is dropped — the same
  trap as the squad and the links (D32, D37). There are THREE builders and missing one fails
  quietly, in only that path: `changeFormation`, the setup importer in `json.ts`, and `applyPreset`.
  Kit pattern shipped having missed the third, so a preset stored it and lost it on the way back in.
- **A pure module must not return prose.** `migrate`, `urlcodec`, `json` and `presets` return a
  `Message` — a key and its variables — because none of their callers agree on a language (D38).
  Adding a `throw new SetupError("some sentence")` puts English back into a module with no user.
- **Never assemble a sentence from fragments.** Anything with a variable in it is a whole key with
  a placeholder. Prepending a translated "Team 1: " to a translated remainder bakes English word
  order into every other language — which is why `resolveTeamLinks` takes a discriminator and picks
  between four whole keys rather than gluing two together.
- **`en.ts` declares the keys; `pt.ts` must answer all of them** or it does not compile. What the
  types cannot check is inside the strings, so `i18n.test.ts` compares `{placeholders}` across
  locales — a renamed variable typechecks and then renders `{name}` to a user.
- **A document does not change language when the reader does.** Boards keep the names they were
  given; only a NEW one is seeded from the active locale, through the labels `createBoardDoc` and
  the scene helpers accept. Locale itself is presentation and never enters `BoardDoc` (D38).
- **DPR double-application** looks correct on a 1× monitor and wrong everywhere else.

## Definition of done

What is built and what is left is in
[`docs/implementation-plan.md`](docs/implementation-plan.md). Two checks belong to every change,
whatever it touches:

- resize the window and confirm players do not move relative to the pitch
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

## Git

Never create branches, commits, or PRs unless explicitly asked. "Fix X" means prepare the
change, not commit it.
