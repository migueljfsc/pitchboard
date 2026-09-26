# Pitchboard — animated football tactics board

Working conventions for this repo. Architecture detail lives in
[`docs/architecture.md`](docs/architecture.md), the build order in
[`docs/implementation-plan.md`](docs/implementation-plan.md), and the reasoning behind every
choice in [`docs/decisions.md`](docs/decisions.md) — cited below as Dn.

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
   retina display — and DPR applied twice looks right on a 1× monitor only.

## Hard decisions — do not relitigate without asking

- **No canvas library.** Konva and SVG were both considered and rejected. A scene graph between
  the code and the pixels is exactly where preview/export divergence comes from. Hit-testing is
  hand-rolled and small.
- **Scenes with per-transition paths**, not pure keyframes and not a pure Gantt of paths.
- **A pass is a carrier change** (`scene.carrier`), not a separate object type.
- **`mediabunny`**, not `mp4-muxer`/`webm-muxer` (deprecated) and not `MediaRecorder` (realtime,
  drops frames).
- **`#d=` share links are immutable snapshots**, with no edit keys and no server. An account's
  published `/share/<slug>` is the other mechanism: a live pointer to its board (D7).
- **OpenTofu owns durable infra; wrangler owns the deploy.** Do not add
  `cloudflare_workers_script` to the stack. This is not a preference: deploying a Worker with
  static assets needs a completion JWT that Cloudflare expires after an hour, obtained by
  hashing and uploading `dist/` first, and Terraform can neither produce it nor hold it in
  state. CI deploys via `.github/workflows/deploy-worker.yml` (D40).

## Non-goals for v1 — do not build

Real player data and autocomplete, cones, thirds views, touch support, heatmaps.
All are deliberate deferrals (D9). The drawing toolkit, half-pitch and a custom domain were once
on this list and have shipped (D20, D109).

## Repository layout

```
docs/                     architecture, implementation plan, decisions
src/board/                the engine — zero React, zero DOM
  types.ts                BoardDoc — single source of truth for the schema
  schema.ts               zod validator, shared with the Worker
  migrate.ts              version dispatch, run before validation on every load
  pitch.ts                IFAB dimensions table + markings
  geometry.ts             bezier, arc-length LUT, easing
  timeline.ts             (doc, t) → resolved positions, incl. ball carrier
  links.ts                connector geometry + distances, and when a link shows
  range.ts                scene ranges — shared by links and annotations, owned by neither
  annotations.ts          the coach's drawing — shapes, scene ranges, hit geometry
  glyphs.ts               the label face's advance widths — what every label is measured by
  highlights.ts           what a scene's highlight names, and pruning it when that leaves
  projection.ts           the 3D view — one fixed camera, and the ground warp
  render.ts               drawBoard() — the one renderer
  interaction.ts          hit-testing, drag, selection, snapping
src/formations/           preset shapes, each seeding its own links
src/export/               worker render loop, mediabunny, gifenc, PNG
src/import/               video-derived tracks in, a board out — see the sibling repo below
  tracks.ts               tracks.json's zod schema; the contract with football-tracks
  reduce.ts               the numerical half — fragments to runs, the roster, the ball
  index.ts                what becomes a player, what becomes a scene, what is refused
src/share/                localStorage, URL-hash codec, API client
  storage.ts              the ONLY place localStorage is touched; never throws
  urlcodec.ts             #d= share links: deflate + base64url, and the budget
  password.ts             the browser's half of password hashing; every constant load-bearing
  json.ts                 board and setup files in and out; owns setupTeamSchema
  presets.ts              named one-team squad presets, built on setupTeamSchema
  local.ts                autosave of the board in progress
src/i18n/                 EN and PT; en.ts is the source of truth for the keys
  core.ts                 pure runtime — the engine imports only `Message` from here
src/fonts.ts              registers the label face, for the page and the export worker
src/App.tsx               picks Viewer or Editor from the hash; no router
src/pages/                Editor, Viewer — read-only playback of a shared board, with fork —
                          and Admin, the operator's usage view (D108)
src/components/           React chrome; ui/ holds shadcn-style primitives
scripts/board.ts          `pnpm board <tracks.json>` — a tracks file through the real importer
worker/                   Cloudflare Worker — the API, and the SPA's static passthrough
  index.ts                the router; /api/* only, assets are served ahead of it
  lib/                    session, google, users, auth (email and password), password,
                          mail, turnstile, boards (and the project tree), presets,
                          admin (the operator's /admin view), crypto, http, limits
  migrations/             D1 schema, applied by CI before the script is deployed
wrangler.jsonc            bindings and asset routing; the ONLY place a binding is declared
infrastructure/terraform/cloudflare/    OpenTofu — R2, D1, KV, Turnstile, DNS. Durable resources only
```

The Worker is application code and lives with the application, not under `infrastructure/`.
`pnpm types` regenerates the ambient bindings; `pnpm deploy:worker` is a local dry-run escape
hatch, but CI owns the real deploy. `src/board/types.ts` is the canonical schema: components
never redefine document shape.

## The sibling repo

`src/import/` reads `tracks.json`, and nothing in this repo produces one. It comes from
[`football-tracks`](../football-tracks) — a Python pipeline that turns a broadcast clip into
player positions in pitch metres, so a coach corrects a play instead of drawing it. The two
repos meet at that file and at nothing else: this one knows no video, that one knows no
`BoardDoc`. Its `schema/tracks.schema.json` and our `src/import/tracks.ts` describe the same
format and have to be changed together.

**Active work is over there, not here.** `football-tracks/PLAN.md` opens with *Where this
stands*; read it before touching either side of the seam.

**`pnpm board` is how a change over there is judged** — a tracks file through the real
`boardFromTracks`, loaded through Vite, printing the roster, the window, observed
player-seconds, `seen`/`worst`, travel, curved runs and turnovers. Anything measured on the
source is re-measured through it before it counts: a better ball is not a better board.

```
pnpm board ../football-tracks/work/SNGS-151/tracks.json          # one clip
pnpm board ../football-tracks/work/*/cmp.*.json --json           # a comparison, machine-readable
pnpm board ../football-tracks/work/Untitled/tracks.json --scenes  # who has the ball, scene by scene
```

## Engineering conventions

- pnpm, Node >= 22.12. TypeScript strict.
- React 19 + Vite 8 + Tailwind v4, following `wtc/ui/` — its ESLint config and `components/ui/`
  primitives are directly reusable.
- Conventional Commits, enforced by commitizen in `commit-msg` and by CI on PRs. Use `cz commit`.
- `pre-commit install` after cloning.
- Tests are Vitest, engine only — no component tests. The engine is pure numerical code where
  tests are cheap and load-bearing: test behaviour through the engine's public operations, and
  keep a test for every trap below rather than for every helper.
- Match the surrounding style. Do not refactor beyond the task.

## Known traps

Each is one line of what breaks; the reasoning is in the cited decision.

### Geometry and rendering
- **Arc-length reparameterisation.** Uniform `u` on a bezier surges and stalls through curves;
  build the 64-sample LUT and invert it. Test numerically, not by eye.
- **The penalty arc** is the part of a 9.15 m circle centred on the *penalty spot* outside the
  box — not an arc on the box edge.
- **An arrowhead only hides what is inside it.** A shaft drawn to the tip pokes out where the head
  narrows; it stops inside the head (`SHAFT_INTO_HEAD`).
- **A ghost is drawn from the stored scene, not a frame**; only the ball needs `ballAt`. In 3D
  ghosts go through `billboard()`.

### The 3D view (D34, D91)
- **Perspective cannot be a canvas transform** — it warps a flat ground layer.
- **In 3D, metre space lands on the grass.** Anything that must stay upright joins the billboard
  pass explicitly: tokens, ball, halos, text labels and drawn balls (`isStanding`).
- **A billboard's axes are the screen's.** +y is down the frame however the board is turned; a
  pitch-space offset copied in points elsewhere.
- **There is ONE camera**, `cameraFor`, used by the renderer and every hit test.
- **Every pointer point comes from `pointFrom` and is checked with `onGrass`** — above the horizon
  `unproject` is NaN, and one NaN in a delta loses the board.
- **Hit-testing splits as drawing does.** Grass things through `unprojectPitch` and the flat
  tests; standing things with `unbillboard`. The 3D order differs from flat: only text sits above
  the tokens, a drawn ball stands among them, so `hitTestGroundAnnotation` skips both.
- **A label's handles live in its billboard**, tested with `hitTestTiltedTextHandle`; its width
  drag passes `rotated` FALSE.
- **Tilt implies a vertical board and is never written to `PitchView.rotated`** (`framingOf`), and
  export follows the projected aspect (`boardAspect`).
- **The goals are the only thing with height** (`project(sx, sy, up)`), depth-sorted by being
  drawn at either end of the billboard pass. A goal with height eats the space behind it, hence
  `TEAM_NAME_OFFSET_3D`.

### Timing and runs (D14, D44)
- **`scenes[0].transitionMs` is meaningless.** Guard it or the first segment is double-counted.
- **A wait is not a shorter travel.** The window fits the latest `delay + travel`; flow mode
  ignores both.
- **Zero holds is not seamless** — `easeInOutCubic` stops at every boundary. Flow mode is linear;
  for one player, `end: "through"`.
- **Both-gradual is `easeInOutCubic`, exactly.** Any "equivalent" ease moves every board ever
  drawn. `runsThrough` is the only rule for whether "through" applies.
- **A run through a scene is placed by TIME.** A Resolved built by hand for another instant must
  drop `ms`, or a runner is drawn where he was.
- **In flow mode any edit retimes the animation** — re-pin the scrubber to the selected scene on
  every change, or the edit lands on a scene the coach is not looking at.
- **A curve's controls are absolute.** `c1` follows the start, `c2` the end, both by what the
  clamp ALLOWED.

### The ball (D44)
- **There is no ball until somebody is given it.** `ballAt` returns null; renderer, hit-test and
  ghosts all check.
- **A dribble is not a pass.** What the ball DID is read from the carrier change
  (`ballTravelBetween`), never from the distance it covered.
- **`shot` and `loft` must not outlive their travel.** A carrier change, delete or reorder
  prunes them (`pruneBallFlags` in `replace`); `canShoot` and `canLoft` are the only gates.
- **A lofted ball drops `easeOutQuad`**, or it hangs beside the receiver and falls vertically.
- **The ball's line and its flight come from `passEnds`**, sampled once — never `u=0`/`u=1`, which
  is wrong the moment the ball has timing of its own, and never re-read per frame, or it homes in.
- **Pass endpoints are live** — the receiver's interpolated position, not his final mark.
- **Giving the ball away carries forward**, and `"all"` reaches no further than `"stationary"`.
- **A drawn ball is not the match ball** (D20); nothing that reads "the ball" sees it.

### Editing (D41, D26, D93)
- **A carry is judged scene-by-scene, never against the edited scene**, or a second nudge
  captures a scene the first stopped at.
- **A drag emits a document per `pointermove`** — history needs the merge key.
- **Anything that deletes or replaces work goes through `notify`**, or the Undo is silently lost.
- **A field that validates per keystroke blocks the value being typed** (7 → 12 passes through 1;
  20 passes through ""). Use `components/ui/NumberField.tsx`; `SizeField` in `DrawPanel.tsx` is
  the one remaining copy.

### Links and drawings (D47, D20, D103)
- **Annotations are not links.** Do not merge them.
- **An annotation's range is scene ids, required; a link's is optional at BOTH ends.** Treating a
  link's `from` as required hides it on every published board. The rule is in `range.ts`.
- **Chains must not close**, and member order is load-bearing.
- **An outline zone is `filled: false`; absent is filled.** Write `ann.filled !== false`.
- **A text label is not in pitch space.** `boundsOf`, `annotationHandles`, `dragAnnotationHandle`
  and `hitTestAnnotation` take `rotated` and default to flat, so forgetting it fails only on a
  rotated board.
- **A label's width is looked up, never measured.** Changing the font files without re-measuring
  `glyphs.ts`, turning kerning back on, or missing the face in the export worker puts the words
  where the box is not. It is drawn at `TEXT_RENDER_PX` and scaled down.
- **The label box hugs its words; the width drag subtracts the panel padding before doubling.**
- **The ruler measures the crop** — on a right half it sits on the RIGHT goal line.

### Highlights and the spotlight (D100)
- **A highlight does NOT carry forward; a position does.** `setHighlight` touches one scene.
- **A highlight and its darkness switch together at the START of the move** — both read
  `Resolved.to`.
- **A key can outlive what it names.** Deletes prune through `withAnnotations`/`withLinks`; the
  spotlight asks `lightsAnything`, never the key count.
- **A lit drawing is never redrawn above the darkness** — glow under it, hole cut to its shape.
  **`lit` is cut by the drawing's own pixels** (`drawKept`), and never darkens a scene.
- **The halo is a billboard, drawn for every entity before any token**, or it sits on a neighbour.

### Formations, squads and kits (D11, D30, D37)
- **Formation slots pair by ORDER, not id** — a renumbered player keeps his id.
- **Two players on one shirt share an id** and the second overwrites the first. `buildTeam` moves
  the loser to the lowest free shirt; the setup importer REJECTS duplicates a file states.
- **A formation change drops that side's links**, and ownership is read from the OLD team.
- **Anything added to `Team` goes through `TeamSpec` at all THREE builders** — `changeFormation`,
  the setup importer in `json.ts`, and `applyPreset`. Missing one fails quietly on that path.
- **A stored preset names players by shirt number**, never by id.
- **There is only ever ONE squad library** — never a local cache while signed in.

### Storage, sharing and language (D7, D31, D38)
- **Anything read from `localStorage` is untrusted** — validate and discard, never repair.
- **A hash change does not reload the page**; listen for `hashchange`, and `replaceState` fires no
  event at all.
- **The share link's framing rides beside the payload** in `v=`, never inside `BoardDoc`.
- **A pure module must not return prose** — it returns a `Message`.
- **Never assemble a sentence from fragments** — a whole key with a placeholder.
- **`pt.ts` must answer every key `en.ts` declares**; `i18n.test.ts` checks placeholders match.
- **A document does not change language when the reader does.**

### Export (D6)
- **Quantise the GIF palette once**, from sampled frames; **delays are differences of rounded
  cumulative times**.
- **Export size follows the board**, both axes even.
- **Cancelling an export is terminating the worker.**

### Worker (D39, D109)
- **Every recursive CTE carries `n < WALK_LIMIT`** — a walk over a cycle does not terminate.
- **The password KDF runs in the browser.** `deriveKey`'s iterations, salt prefix and email
  normalisation are frozen by a test vector; changing any locks every password account out.
  The browser's `normaliseEmail` and the Worker's must agree.
- **No `users` row is written before its address is verified** — the Google join trusts it.
- **An auth route never says whether an address has an account**: mail is sent in `waitUntil`,
  after an identical `ok`.
- **Auth bodies must be `application/json`** — a `text/plain` form POST is the login CSRF.
- **Never mix a bare `?` with `?N` in one statement** — SQLite binds the wrong value, silently.
- **Deleting a project deletes its subtree**; the confirmation counts it.
- **`buildTree` must not trust its rows** — orphans to the root, cycles broken.

### The importer (D52, D71, D73, D75, D81)
- **Never judge whether the football is any good.** Fidelity is the whole objective.
- **A track is not a player.** `splitImpossible` runs first; anything counting tracks counts
  fragments.
- **A speed across one frame is a position error times fps.** Thresholds dividing by a frame
  interval break at a new frame rate, and a good score on a short board is the symptom.
- **The window is the WHOLE CLIP** — `positionAt` holds a player outside his track. Trim an end
  only where NOTHING was seen. `chooseWindow` is gone; do not bring a passage chooser back.
- **The roster is a COVER with depth, not a ranking**, and it keeps filling once covered; the
  players the ball goes through are reserved. There are fewer slots than appearances.
- **`coverage` measures a span; use `witnessed`** for "how much of him did we see". `seen` and
  `dens` falling is not automatically a regression — read them with the roster.
- **A fidelity rule never touches an event** — a kick-off has nobody gathered round it. Gate the
  scenes the split invented, never the ball.
- **A scene is the worst place to draw from memory, and the split aims at it.** `chooseScenes`
  splits where a player deviates most from his interpolation, and a player just lost deviates
  hardest — hence `SCENE_BACKED_FLOOR`.
- **`positionAt` CLAMPS, so every rule that names a player checks he was THERE.** The kicker
  backfill stops at the last scene somebody was named at.
- **The carrier is whoever KEEPS the ball, within `SNAP_M` at least once**; a fly-over is not a
  pass, and speed cannot tell them apart.
- **A one-touch pass is a change of direction** (`touchedAt`); events get their own 0.2 s gap.
- **A one-scene turnover that hands the ball back never happened** (`steady`); a change of side is
  seen twice; a keeper's catch and a lost tackle are not turnovers.
- **A holder's silence expires** (`CARRY_S`), measured backwards only.
- **A pass in flight is the passer's until somebody has it**; a flight with a player at both ends
  holds the kicker.
- **A shot is a silence** (`breaks`), marked at its departure only where somebody still had it.
- **Behind the line between the posts is a goal, and stays in the net.**
- **A loose ball is drawn at the nearest player's feet**, without naming him.
- **An unreadable track BLOCKS the ball**; `referee` does not.
- **A ball in the air is not where the board draws it** — `airborne` needs the bow AND `MAX_AIR_S`.
- **An arrow shorter than the camera's error is noise** (`STILL_M`), compared with where the
  player was last DRAWN.
- **The board wears the kits the file measured**, snapped to `PALETTE`; `home` is the side
  defending the nearer goal, not the coach's home side.

## Definition of done

What is built and what is left is in
[`docs/implementation-plan.md`](docs/implementation-plan.md). Two checks belong to every change,
whatever it touches:

- resize the window and confirm players do not move relative to the pitch
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

## Git

Never create branches, commits, or PRs unless explicitly asked. "Fix X" means prepare the
change, not commit it.
