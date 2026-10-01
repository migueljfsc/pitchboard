# Pitchboard — animated tactics board

Working conventions. Architecture: [`docs/architecture.md`](docs/architecture.md); what is built:
[`docs/implementation-plan.md`](docs/implementation-plan.md); every choice's reasoning:
[`docs/decisions.md`](docs/decisions.md), cited as Dn.

## Mission

A browser tactics board — football, futsal, basketball, handball, field hockey, ice hockey and
volleyball on one engine (D113) — where a coach draws a formation, moves players between scenes
along curved runs, and exports MP4, GIF or PNG. Everything renders client-side; there is no server
video pipeline and will not be one.

The differentiator is **live links**: a connector recomputed every frame from its players'
interpolated positions, so the shape deforms as they move. Build for that.

## The two invariants

1. **`drawBoard` is pure.** No DOM, React, `Date.now()`, `Math.random()` or module-level state;
   `(doc, t, view)` gives the same pixels in any thread. A value it needs belongs in `BoardDoc` or
   `Viewport` — no third source of truth. Breaking it breaks export fidelity, far from the cause.
2. **No pixels in the document.** Coordinates are board units on `doc.pitch`: metres on football,
   other courts scaled to its 105-unit length, `sportOf(doc).metresPerUnit` back to metres (D113).
   `Viewport` converts at the edges; `devicePixelRatio` lives in the canvas transform, never in
   `Viewport.scale`. Breaking it shows as players drifting on resize or retina — and DPR applied
   twice looks right on a 1× monitor only.

## Hard decisions — do not relitigate without asking

- **No canvas library** — Konva and SVG rejected; a scene graph is where preview/export diverge.
- **Scenes with per-transition paths**, not pure keyframes nor a Gantt of paths.
- **A pass is a carrier change** (`scene.carrier`), not an object.
- **`mediabunny`**, not `mp4-muxer`/`webm-muxer` (deprecated) nor `MediaRecorder` (realtime, drops frames).
- **`#d=` links are immutable snapshots**, no edit keys, no server; an account's `/share/<slug>` is
  the live pointer (D7).
- **OpenTofu owns durable infra; wrangler owns the deploy.** Never add `cloudflare_workers_script`:
  a Worker with assets needs a completion JWT, expiring in an hour, obtained by uploading `dist/`,
  which Terraform can neither produce nor hold. CI deploys via `deploy-worker.yml` (D40).

## Non-goals for v1 — do not build

Real player data and autocomplete, cones, thirds views, touch support, heatmaps (D9).

## Repository layout

```
docs/                     architecture, implementation plan, decisions
src/board/                the engine — zero React, zero DOM
  types.ts, schema.ts     BoardDoc (the schema); its zod validator, shared with the Worker
  migrate.ts              version dispatch, before validation on every load
  sports.ts               every sport's spec, and units ↔ metres
  surfaces.ts             each sport's theme and drawing — the renderer never asks which sport
  pitch.ts, court.ts, futsal.ts, handball.ts, hockey.ts, icehockey.ts, volleyball.ts
                          each court in its rulebook's metres; markings.ts holds shared shapes
  geometry.ts             bezier, arc-length LUT, easing
  timeline.ts             (doc, t) → resolved positions, incl. the ball
  links.ts, range.ts      connector geometry; scene ranges shared with annotations
  annotations.ts          the coach's drawing — shapes, ranges, hit geometry
  glyphs.ts               the label face's advance widths
  highlights.ts           what a highlight names, and pruning it
  projection.ts           the 3D camera and ground warp
  render.ts               drawBoard() — the one renderer
  interaction.ts          hit-testing, drag, selection, snapping
src/formations/           preset shapes, each seeding its links
src/export/               worker render loop, mediabunny, gifenc, PNG
src/import/               tracks.ts (the contract), reduce.ts (numbers), index.ts (what becomes a board)
src/share/                storage.ts (the ONLY localStorage access; never throws), urlcodec.ts (#d=),
                          password.ts (browser KDF), json.ts (board and setup files), presets.ts,
                          local.ts (autosave), small per-browser prefs (viewBar, scenePreviews, …)
src/i18n/                 EN and PT; en.ts declares the keys; core.ts is all the engine imports
src/fonts.ts              registers the canvas label face, for page and export worker
src/pages/                Landing (`/`, D118), Editor (`/app`), Viewer (shared boards), Admin (D108)
src/components/           React chrome; ui/ holds shadcn-style primitives
scripts/board.ts          `pnpm board <tracks.json>` — a tracks file through the real importer
worker/                   the Worker: index.ts routes /api/* and /share/<slug>; lib/ by concern;
                          migrations/ for D1, applied by CI before deploy
wrangler.jsonc            bindings and asset routing; the ONLY place a binding is declared
infrastructure/terraform/cloudflare/    OpenTofu — R2, D1, KV, Turnstile, DNS
```

The Worker is application code, not infrastructure. `pnpm types` regenerates bindings;
`pnpm deploy:worker` is a local dry run — CI owns the deploy. Components never redefine document shape.

## The sibling repo

`src/import/` reads `tracks.json` from [`football-tracks`](../football-tracks), a Python pipeline
turning a broadcast clip into positions in pitch metres. The repos meet at that file only — this one
knows no video, that one no `BoardDoc` — so its `schema/tracks.schema.json` and our `tracks.ts`
change together. **Active work is over there**: read `football-tracks/PLAN.md` (*Where this stands*)
before touching the seam.

**`pnpm board` judges a change there** — a tracks file through the real `boardFromTracks`, printing
roster, window, observed player-seconds, `seen`/`worst`, travel, curved runs and turnovers. Anything
measured on the source is re-measured through it: a better ball is not a better board.

```
pnpm board ../football-tracks/work/SNGS-151/tracks.json          # one clip
pnpm board ../football-tracks/work/*/cmp.*.json --json           # a comparison, machine-readable
pnpm board ../football-tracks/work/Untitled/tracks.json --scenes  # who has the ball, scene by scene
```

## Engineering conventions

- pnpm, Node >= 22.12, TypeScript strict; React 19, Vite 8, Tailwind v4 after `wtc/ui/`.
- Conventional Commits via commitizen (`cz commit`), enforced in `commit-msg` and CI;
  `pre-commit install` after cloning.
- Vitest, engine only: test behaviour through public operations, and keep a test for every trap
  below rather than every helper.
- Match the surrounding style; do not refactor beyond the task.

## Known traps

Each is one line of what breaks; the reasoning is in the cited decision.

### The look (D126)
- **The accent is chalk and is no kit's colour.** Amber means the home kit, the ball and warnings;
  bringing it back to the chrome makes a selection vanish on the home side.
- **On is a filled, outlined tile** (`bg-accent/15`, 70% chalk border or ring); off has no fill.
  A colour change alone does not read as on.
- **Pass `DISPLAY` to `cn` after any text size**, or tailwind-merge drops its leading.
- **`BoardCanvas` is transparent** — editor and viewer show the page round the pitch; only an
  export paints the surround. In 3D, shading darkens painted pixels only (`source-atop`).

### Sports (D113)
- **A unit is a metre only on a football pitch.** Anything a person reads — link distances, the
  ruler, the pass speed, the flow pace — goes through `toMetres`. Everything tuned in units
  (tokens, lines, snaps, the 3D camera) stays tuned for every court.
- **Never branch on a sport's name at a call site.** Read the `SportSpec` — `surface`, `goal`,
  `keeper`, `snaps`, `headroom`, `ballGlyph` — or a table keyed by sport (`surfaceOf`, the ball's
  looks, the formation catalogue). A new sport that misses one fails to typecheck, by design. Football's spec is the old constants exactly — change it and every
  board ever drawn moves.
- **Anything a sport adds is optional, and absent is football** — on the board, a preset and a
  setup file alike, so every board and link made before reads the same.
- **A board may be more than its court.** Volleyball's is the court and its free zone
  (`SportSpec.court` is where the lines are), so a server can stand behind the end line; the
  board's edge, not a line, is what clamps a player. Its net stands across the middle and is
  sorted among the players by the centre line, as a ring is by its backboard.
- **An ice hockey net stands on the ice** (`NetGoal.line`, D123). A goal is the net's footprint, not
  everything past the goal line, and in 3D it is sorted among the players like a ring. Read where a
  goal is with `goalLineX`, never assume the end of the board.
- **A ring stands INSIDE the court.** It is depth-sorted among the billboards by its backboard,
  never drawn at the ends as a net is; in 3D a drop on it is tested where it is drawn
  (`ringAtScreen`), and a goal takes the ball over a player standing under it.
- **Switching sport never replaces a board saved to the account in place** — its autosave would
  carry the new sport over it. It starts a fresh board instead (`switchSport`).

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
- **A carried ball never snaps round.** Standing, it points the way he last ran (`lastHeading`),
  not his team's attack; setting off, it turns over his first `ballGlue` metres.
- **Giving the ball away carries forward**, and `"all"` reaches no further than `"stationary"`.
- **A drawn ball is not the match ball** (D20); nothing that reads "the ball" sees it.
- **A dragged ball is played from the document the drag STARTED from** (D111), or a carrier
  sticks to every player it passes over. Only the net infers a shot.

### Editing (D41, D26, D93, D125)
- **A carry is judged scene-by-scene, never against the edited scene**, or a second nudge
  captures a scene the first stopped at.
- **A drag emits a document per `pointermove`** — history needs the merge key.
- **Anything that deletes or replaces work goes through `notify`**, or the Undo is silently lost.
- **Presenting edits nothing.** The key handler's `present` branch returns before any editing
  key; a new shortcut that edits goes below it (D116).
- **The squad list's order is the formations' slot order** (D125) — never sort or reorder its
  rows; a renumber that moved a row looked like a player being added.
- **The Selection card shows a link only while the selection is exactly its members** (D125);
  a pick selects them first, so any other click hands the card back.
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
- **A drawn shape lives on the team, not only in the library** (`Team.shape`, D122) — a team has
  `formation` or `shape`, never both, and anything that reads a team's formation reads both.
  Saving one moves nobody (`setTeamShape`); picking one is a formation change.
- **A stored preset names players by shirt number**, never by id.
- **There is only ever ONE squad library** — never a local cache while signed in.

### Storage, sharing and language (D7, D31, D38)
- **Anything read from `localStorage` is untrusted** — validate and discard, never repair.
- **A hash change does not reload the page**; listen for `hashchange`, and `replaceState` fires no
  event at all.
- **The share link's framing rides beside the payload** in `v=`, never inside `BoardDoc`.
- **A pure module must not return prose** — it returns a `Message`. Text the engine writes INTO a
  document (a seeded link's name) takes a namer from the caller (`LineNamer`), English by default.
- **Never assemble a sentence from fragments** — a whole key with a placeholder.
- **`pt.ts` must answer every key `en.ts` declares**; `i18n.test.ts` checks placeholders match.
- **A document does not change language when the reader does.**

### Motion and the landing page (D118)
- **Motion speaks `lib/motion.ts`** — three durations, two eases, mirrored by the CSS tokens. A
  dialog is `ui/Modal`; it only animates OUT inside an `AnimatePresence`, with a key.
- **Animation never reaches `drawBoard` through a clock.** A canvas animation is a number in
  `RenderView` that the caller drives and an export leaves absent (`focusIn`).
- **`requestAnimationFrame` stops in a background tab.** Anything that must end in a state
  (the selection ring, a cross-fade) has a timeout or a layout read to land it without frames.
- **`/` is the landing page, `/app` the editor.** A link the editor must act on carries a
  parameter `wantsApp` knows, or the landing page swallows it.
- **The logo links to `HOME_PATH`, never a bare `/`** — `/` sends a signed-in visitor on to
  the editor, so a logo pointing there never reaches the landing page.
- **Nothing on the landing page starts invisible and waits for a script** (D124). The headline is
  drawn at once; the rest fades up in CSS or reveals on a scroll timeline (`.reveal`), and is just
  there where neither runs — a crawler, a background tab, reduced motion.

### Export (D6)
- **Quantise the GIF palette once**, from sampled frames; **delays are differences of rounded
  cumulative times**.
- **Export size follows the board**, both axes even.
- **Cancelling an export is terminating the worker.**

### Worker (D39, D109, D110, D114, D119)
- **Every recursive CTE carries `n < WALK_LIMIT`** — a walk over a cycle does not terminate.
- **The password KDF runs in the browser.** `deriveKey`'s iterations, salt prefix and email
  normalisation are frozen by a test vector; changing any locks every password account out.
  The browser's `normaliseEmail` and the Worker's must agree.
- **No `users` row is written before its address is verified** — the Google join trusts it.
- **`PASSWORD_PEPPER` is never rotated casually** — losing it locks out every password account.
  `hashKey` throws without it rather than storing an unkeyed hash.
- **An auth route never says whether an address has an account**: mail is sent in `waitUntil`,
  after an identical `ok`.
- **Auth bodies must be `application/json`** — a `text/plain` form POST is the login CSRF.
- **A new table that stores anything about a person joins `deleteAccount`'s list** (D110).
  The cascade is a backstop, not the contract.
- **Never mix a bare `?` with `?N` in one statement** — SQLite binds the wrong value, silently.
- **A new third-party origin goes in `SECURITY_HEADERS`** — the CSP there covers the Worker's
  responses and, through the `_headers` the build writes, every static file (D116).
- **`usage_daily` names nobody** (D119) — no user, session, address or board, ever; that is why
  it is off `deleteAccount`'s list. A new event goes in `USAGE_EVENTS` on both sides.
- **Expired rows are the daily sweep's** (`cleanup.ts`, D120) — a new table with an expiry joins it.
- **`POST /api/usage` is the one unauthenticated write**: the event list, `USAGE_LIMIT` and the
  per-row cap are what keep it from spending the free tier. Keep all three.
- **Deleting a project deletes its subtree**; the confirmation counts it.
- **A sport's root is the library's shape** (D114): never renamed, moved or deleted, never counted
  against the folder or depth caps, and every other folder lives under one. A board is filed
  under its own sport only — the Worker enforces it in the statement, reading the document's sport
  with `json_extract`. `worker/lib/sports.ts` mirrors `SPORT_IDS`; a test fails if they drift.
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

Every change, whatever it touches:

- resize the window and confirm players do not move relative to the pitch
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

## Git

Never create branches, commits or PRs unless asked. "Fix X" means prepare the change, not commit it.
