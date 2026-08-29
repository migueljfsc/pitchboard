# Pitchboard — Implementation Plan

Phased build plan. Each phase has tasks, a definition of done, and the risks specific to it.
Architecture detail lives in [`architecture.md`](./architecture.md); the reasoning behind the
choices lives in [`decisions.md`](./decisions.md).

**Sequencing principle:** the pure engine (`src/board/`) is built and tested before any React
touches it. Every phase ends at a state you can actually look at.

| Phase | Deliverable | Usable output |
|---|---|---|
| M0 | Documentation | This directory |
| M1 | Static board | Drag a 4-3-3 around a real pitch |
| M2 | Animation | Scrub a multi-scene move with curved runs and passes |
| M3 | Links | Watch a midfield 3 deform as it presses |
| M4 | Export | MP4 / WebM / GIF / PNG out |
| M5 | Persistence | Share a link |
| M6 | Infra + CI | Deployed and green |

M1–M3 is a usable tool. M4 is the payoff. M5–M6 make it shareable and deployed.

---

## M0 — Documentation

**Status: this phase.** Gate before any code.

- [x] `docs/architecture.md` — renderer contract, coordinates, schema, timeline, ball, links, export, sharing
- [x] `docs/implementation-plan.md` — this file
- [x] `docs/decisions.md` — decision log with rejected alternatives

**Done when:** reviewed and signed off. The schema in `architecture.md` matches what M1 says it
builds, and nothing in the plan contradicts the decision log.

---

## M1 — Scaffold and static board

**Status: complete.**

Goal: a real-looking pitch with two teams you can drag. No time dimension yet.

### Tasks

1. **Scaffold** — Vite 8 + React 19.2 + TS 5.6 strict, pnpm, Node >= 22.12. Tailwind v4 via
   `@tailwindcss/postcss`. ESLint 10 flat config copied from `wtc/ui/eslint.config.js`. Vitest.
   `@` → `./src` alias, matching `wtc/ui/vite.config.ts`.
2. **`board/types.ts`** — the full schema from `architecture.md` §3.
3. **`board/schema.ts`** — zod validator plus the invariants in §3, and a `createEmptyDoc()`.
4. **`board/pitch.ts`** — the dimensions table and `drawPitch()`. Real IFAB measurements.
5. **`board/geometry.ts`** — `Vec2` helpers, `lerp`, easing functions. Bezier and arc-length
   land in M2, but the file and its test exist now.
6. **`board/render.ts`** — `drawBoard()` handling pitch, tokens, and the ball. It takes a `t`
   argument from day one and ignores it; M2 fills it in without changing a signature.
7. **`board/interaction.ts`** — viewport transforms, token hit-testing, single and multi-select,
   drag, marquee, line nudge.
8. **`formations/index.ts`** — presets generated from notation, for both attacking
   directions. "Save current as custom" is still outstanding.
9. **`components/BoardCanvas.tsx`** — canvas host, DPR handling, resize observer, pointer wiring.
10. **Shell UI** — toolbar, team colour pickers, formation selector, inspector panel. Port the
    shadcn-style primitives from `wtc/ui/src/components/ui/`.

### Definition of done

- [x] Pick a formation, both teams populate correctly for their attacking direction
- [x] Drag individual players and multi-selections; line nudge shifts a whole back 4
- [x] Resize the window — **positions do not move relative to the pitch** (verified in the
      browser; canvas backing store stays exactly css x dpr, so nothing is stretched)
- [x] Pitch renders correctly at any aspect ratio, penalty arcs included
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

### What M1 actually shipped, beyond the task list

- `createBoardDoc()` and `applyFormation()` live in `src/formations/index.ts`; there is no
  `createEmptyDoc()` in `schema.ts` (see architecture.md).
- `frameAt(doc, t)` in `render.ts` is the seam M2 replaces with `resolveAt` — it already takes
  and ignores `t`, so no call site changes.
- `src/board/recording-ctx.ts` — the proxy context the renderer tests run against.
- **Presets are kickoff shapes.** The first draft put a 4-3-3 front line and a 4-4-2 midfield
  both at x=61 m, so tokens rendered on top of each other on the default board. No line now
  passes `DEPTH_MAX` (0.45), and a test asserts a minimum gap across every preset pairing —
  currently 9.45 m at the closest, across 729 combinations.
- **27 presets, generated from notation**, matching the eleven-a-side catalogue at
  lineup-builder.co.uk and grouped in the picker by back-line shape. Adding a formation is
  adding a string to `NOTATIONS`; there is no hand-written table to keep consistent. The
  interesting rule is width: an interior three is compact in a 4-3-3 (central midfielders)
  but wide in a 4-2-3-1 (wingers), and what separates them is whether the line ahead already
  carries the width.
- Still outstanding from the original M1 list: "save current as custom formation".

### Risks

**Coordinate leakage.** The most likely bug in the whole project is a pixel value reaching the
document. It shows up as players drifting on resize or on a retina display. The window-resize
check in the DoD is there specifically to catch it, and it should be run at every phase.

**DPR double-application.** Applying `devicePixelRatio` in both the canvas transform and
`Viewport.scale` looks right on a 1× monitor and wrong everywhere else.

**Penalty arc.** It is the arc of a circle centred on the penalty spot, clipped to outside the
box — not an arc drawn on the box edge. Worth eyeballing against a reference image.

---

## M2 — Animation

**Status: complete.**

Goal: scenes, curved runs, passes, playback.

### Tasks

1. **`geometry.ts`** — cubic bezier evaluation, the 64-sample arc-length LUT, and the inversion
   `s(d)`. Cache on the path, invalidate on control-point edit. See `architecture.md` §4.
2. **`board/timeline.ts`** — `resolveAt(doc, t)`, `positionAt(entity, resolved, doc)`, total
   duration. Clamp out-of-range `t`.
3. **Ball carrier model** — the five-case matrix in `architecture.md` §5, `easeOutQuad` for
   passes, endpoints evaluated live from `positionAt` so passes lead a moving target.
4. **Path editing** — drag from a token to draw a motion arrow; bezier handles appear on
   selection; delete a path to revert to a straight tween.
5. **`render.ts`** — motion paths and arrowheads, gated on `moving` or selection.
6. **`components/Timeline.tsx`** — scene strip with add / duplicate / delete / reorder, per-scene
   transition and hold durations, scrubber, play/pause, loop toggle.
7. **Scene management** — duplicating a scene copies positions and clears paths; deleting a scene
   takes its paths with it.

### Definition of done

- [x] Build a 3-scene move with curved runs — verified in the browser
- [x] Scrub the full timeline — **players track their arrows at visibly constant speed**
- [x] Set a carrier, pass to another player, carry again: ball glues, travels, re-glues
- [x] Pass to a player who is moving during the same transition — ball arrives on them
- [x] Delete a middle scene; no orphaned paths, no crash
- [x] Scrub to exactly `t=0` and `t=totalMs/1000` without `NaN`

### Notes from the build

- **Editing a run does not require scrubbing to find it.** `RenderView.editScene` draws the
  selected players' runs into the scene being edited, wherever the scrubber sits, with draggable
  control handles. A straight run still yields handles (synthesised onto the line), so bending
  one needs no separate "make this curved" gesture.
- **The arc table is not cached** — see architecture.md for why.
- Fixed during verification: selecting a newly added scene put the scrubber at the wrong time,
  because the callback closed over the pre-edit document. Scene-list mutations now pass the new
  document to the selection handler.

### Risks

**Arc-length reparameterisation is the phase's whole difficulty.** Skip it and players surge and
stall through curves. Test the LUT numerically — sample the reparameterised curve at uniform
intervals and assert the chord lengths are near-equal — rather than by eye.

**Pass endpoint staleness.** Targeting `to.positions[B]` instead of B's interpolated position
makes the ball arrive where the receiver *will be*, then jump. Both endpoints must come from
`positionAt`.

**Scene-0 transition.** `scenes[0].transitionMs` is meaningless. Guard it in the timeline maths
and ignore it in the UI, or the first segment gets double-counted.

---

## M3 — Links

**Status: complete.**

Goal: the headline feature.

### Tasks

1. **`board/links.ts`** — `linkGeometry()` returning points, closed flag, and per-edge metre
   distances, resolved from interpolated positions every frame.
2. **Render** — `chain` (open polyline, never closes), `polygon` (closed), `filled` (closed +
   translucent fill). Drawn under player tokens.
3. **Distance labels** — per-link toggle, off by default, drawn upright at edge midpoints.
4. **Link editor** — create from the current selection, name it, reorder members (order defines
   the chain sequence), pick style and colour, show/hide.
5. **Preset-seeded links** — formations ship their own links. Choosing 4-3-3 yields a back-4
   chain and a midfield-3 chain already wired. (Seeded as triangles originally; every unit now
   seeds as an open chain, and closing one is the author's choice — see D21.)
6. **Group operations** — select a link to select its members; drag the unit; nudge the line.

### Definition of done

- [x] Back 4 as a chain does **not** draw a closing edge across the pitch
- [x] Midfield 3 as a polygon deforms live during playback as members move independently
- [x] Filled style makes a press trap's area visibly collapse and expand
- [x] Distances update continuously through a transition and read correctly
- [x] Reordering members changes the chain path as expected
- [x] Deleting a player removes them from every link that referenced them (`pruneLinks`)

### Notes from the build

- A polygon of two members degrades to a chain. Closing it would draw the same segment twice.
- `pruneLinks` is the single place squad changes are reconciled; `applyFormation` calls it rather
  than filtering links itself.
- Links are hit-tested **after** tokens, so clicking a player selects the player, not the
  connector running beneath them. Clicking a connector on open grass selects its members.
- Distance labels are drawn upright at edge midpoints. Rotating them with the edge looks clever
  and reads badly.
- New members are ordered by squad order rather than click order, so a back four selected
  right-to-left still draws as a sensible line.
- `Link.hidden` is optional, so documents written before the visibility toggle stay valid.

### Risks

**Member order is load-bearing** for chains and polygon perimeters. The editor must expose
reordering; add/remove alone will produce crossed polygons that look like a rendering bug.

**Dangling references.** Deleting a player or a scene must clean up links. Cover it in the
schema invariant tests.

---

## M4 — Export

**Status: complete.**

Goal: MP4, GIF, PNG out of the browser, nothing server-side.

### Tasks

1. **`export/frame.ts`** — the pure layer: board aspect, even-dimension sizing, frame count and
   timestamps, GIF delays, palette sample indices. Everything the dialog quotes and the worker
   renders comes from here, and it is the only part with tests.
2. **`export/image.ts`** — hi-res PNG at a configurable long edge, current frame, main thread.
3. **`export/worker.ts`** — the offline render loop, progress messaging, one request per worker.
4. **`export/video.ts`** + **`export/codecs.ts`** — mediabunny wiring and the MP4 → WebM ladder.
5. **`export/gif.ts`** — `gifenc` with one palette for the whole animation.
6. **`export/client.ts`** — main-thread handle: spawn, progress, cancel by termination.
7. **`components/ExportDialog.tsx`** — format, resolution, fps, bitrate, progress, cancel.

### Definition of done

- [x] PNG at 4x is crisp; text and line weights scale proportionally — a 3840 render downscaled
      to 960 matches a native 960 render (mean error 1.2/255)
- [x] MP4 plays in a browser and in QuickTime — macOS reads the file as H.264 `public.mpeg-4`
- [x] **Frames from the exported MP4 match the editor preview at the same `t`** — three
      timestamps including two mid-transition, decoded back and diffed per pixel: mean error
      ~1/255, and decoded timestamps land exactly on the requested ones
- [x] Stub the capability check: WebM (VP9) and GIF both produce playable files
- [x] GIF does not shimmer — one global colour table, zero local tables, asserted on the bytes
- [x] Export of a 20-second animation completes faster than realtime and does not freeze the UI
      — 19.5 s at 1920x1318/60 encodes in 7.3 s, with no main-thread stall over the idle baseline
- [x] Cancel mid-export leaves no leaked worker — one created, one terminated, none live, and no
      callbacks afterwards

### Notes from the build

- **The frame-match check needs a control.** "The exported frame matches the preview" is only
  worth anything alongside evidence the comparison could have failed. Diffing the same decoded
  frame against the preview one frame either side gives 1.78 where the match gives 1.07, so the
  metric has the power to catch an off-by-one — without that number the low error proves nothing
  more than that both images are mostly grass.
- **Sizing follows the board, not 16:9** (D28). A rotated board in a 16:9 frame is a strip
  between two wide bands of surround.
- **The GIF palette is quantised over sampled frames** (D29), not built from the board's named
  colours as originally specified. Antialiased edges and translucent link fills are most of the
  picture, and they have no named colour.
- **A GIF delay is centiseconds**, so naive per-frame rounding runs a 30 fps clip a full second
  short over ten seconds. Differences of rounded cumulative times fix it; the exported delays sum
  to the clip duration exactly.
- **Each format keeps its own resolution.** One clamped list meant picking GIF and then MP4 again
  silently exported at GIF's size — the user's 2560 quietly became 960.
- **Cancelling is terminating the worker.** A cooperative flag cannot be read by a thread inside a
  synchronous encode loop, and there is nothing left to clean up once the scope is gone.
- **Verifying "the UI does not freeze" needs a baseline.** A background tab clamps timers to one
  second, which looks exactly like a blocked main thread; the idle measurement and the
  during-export measurement have to be compared rather than read absolutely.

### Risks

**Preview/export divergence** is the failure this whole architecture exists to prevent. If it
happens, something non-deterministic reached `drawBoard` — a DOM read, a hook value, a timestamp.
Fix the leak; do not add a compensating fudge to the exporter.

**GIF palette shimmer.** Per-frame quantisation is the default in most encoders and is wrong
here. Build the palette once, up front.

**Memory on long exports.** `BufferTarget` holds the whole file in memory. Fine at the lengths a
tactics board produces; if a very long animation is ever needed, switch to `StreamTarget`.

---

## M5 — Persistence and sharing

Goal: a link you can send someone.

### Tasks

1. ~~**`share/local.ts`** — `localStorage` autosave with debounce, restore on load.~~ **Done**,
   with squad presets in M10. The `.json` import/export half shipped early in M8 as
   `share/json.ts`.
2. **`share/urlcodec.ts`** — `#d=<base64url(deflate(json))>` via native `CompressionStream`,
   with a length budget check.
3. **`share/api.ts`** — client for the Worker endpoints.
4. **`worker/index.ts`** — `POST /api/boards`, `GET /api/boards/:id`, static passthrough. Imports
   the app's `schema.ts`. Size cap 256 KB, zod validation, rate-limiting binding on `POST`.
5. **`pages/Viewer.tsx`** — read-only playback of a shared board, with "fork to edit".
6. **`board/migrate.ts`** — version dispatch, running before validation on load.

### Definition of done

- [x] Reload the page mid-edit; work is restored
- Publish a link, open it in a private window: board and animation reproduce exactly
- Self-contained `#d=` link opens with the API blocked in devtools
- Oversized payload is rejected with a useful message, not a 500
- Malformed and hand-tampered payloads are rejected by zod on the Worker
- Fork from a shared board produces an independent local copy

### Risks

**Payload size.** Long animations with many paths grow quickly. Measure a realistic worst case
early — a 10-scene board with paths on every player — and confirm the compressed URL budget and
the 256 KB cap are both sensible.

**Schema drift between client and Worker.** Prevented by importing one `schema.ts`. Do not let a
second validator appear in `worker/`.

---

## M6 — Infrastructure and CI

Goal: deployed, green, documented.

### Tasks

1. **OpenTofu stack** at `infrastructure/terraform/cloudflare/`, mirroring the
   `motorcycle-journey` layout: `backend.tf`, `providers.tf`, `variables.tf`, `locals.tf`,
   `outputs.tf`, `kv.tf`, `contexts/prod.tfvars`, `backend.hcl.example`, `README.md`.
   OpenTofu `~> 1.11`, `cloudflare/cloudflare ~> 5.0`, S3-compatible state on R2.
2. **DNS / custom domain stubbed but gated** behind a `has_domain` flag, following the existing
   `enable_pages` pattern. v1 runs on `*.workers.dev`.
3. **`wrangler.jsonc`** — static assets + KV binding + routes.
4. **Workflows** — `ci.yml` (lint, typecheck, test, build), `terraform.yml` (plan on PR, apply on
   main, `concurrency: tofu-cloudflare`, `cancel-in-progress: false`, Dependabot skipped),
   `deploy.yml` (build + `wrangler deploy` on main).
5. **Repo furniture** — `AGENTS.md` with `CLAUDE.md` symlinked to it, `README.md` with CI badge,
   `.cz.yaml`, `CHANGELOG.md`, `.pre-commit-config.yaml`, `dependabot.yml`.

### Definition of done

- `tofu plan` shows only intended resources
- Deployed Worker serves both the SPA and `/api/boards`
- All three workflows green
- `AGENTS.md` documents the renderer purity rule and the coordinate-system rule — the two
  invariants a future contributor is most likely to break

### Risks

**KV namespace id handoff.** OpenTofu creates the namespace; `wrangler.jsonc` needs its id.
Run `tofu output -raw kv_namespace_id` after the first apply and paste it in — it is not a
secret. Document this in the stack README; it is the one manual step and it will be forgotten
otherwise.

**Ownership split.** OpenTofu owns the KV namespace, `wrangler` owns the script. Do not add
`cloudflare_workers_script` to the stack — it fights the Vite build for control of the artefact.

---

## Shipped outside the milestones

Requested during M3 review and built straight away:

- **Free-text team names.** Already an input; it only needed to look like one.
- **Per-team visibility**, so a board can show one side alone. Hides the team's links too, and
  the selection filters concealed players out rather than dropping them (D13).
- **Half-pitch view** — left, full or right — for attacking or defensive analysis. This was
  slated for v2; it fell out of the viewport work almost free.
- **Vertical board.** A quarter turn with the attacking direction up the screen. Text
  counter-rotates so numbers stay upright (D12).
- **Collapsible sidebar sections** — View, each team, Links, Selection — with badges for
  formation, link count and selection size.
- **Player names and numbers**, editable when a single player is selected. The name shows under
  the token; until one is given, the shirt number stands in.
- **Links named after their members** in link order, falling back to shirt numbers. Renaming
  moved behind an explicit chevron — it was undiscoverable behind the colour dot.
- **Per-player travel time** (D14), so one player can cover their run faster or slower than the
  rest of the scene.
- **Half views clip** (D15). They were positioning the crop correctly but never clipping, so the
  other half drew into the spare canvas width and it read as a shift. Orientation stays an
  independent toggle.
- **Player size**, 0.5x to 2.5x (D18), scaling the drawing and hit-testing together.
- **Team names behind the goals**, laid along the goal line so they read upright in both
  orientations. The grass padding grew to 5 m to seat them, shared as `PITCH_PADDING` between
  the fit and the half-view clip so the band is never cut off.
- **Squad editing** — add and remove players per team. The interesting part is the cleanup:
  removing someone has to touch every scene, both link lists and possibly the ball, or the
  document stops validating. Every test asserts the result still parses.
- **Release workflow** — commitizen bump, changelog, tag and GitHub Release, matching the other
  projects here. Needs a `RELEASE_TOKEN` secret: `main` is protected and the built-in
  `GITHUB_TOKEN` cannot push to it.
- **Contrast pass.** Muted text was under 4.5:1 on the panel background and borders were nearly
  invisible; both were lifted, along with disabled states and the smallest type.
- **GitHub Pages deploy** (D16), gated on the full check suite.

---

## M7 — Annotations

Shipped ahead of M4, out of the original order: it was a v1 non-goal, pulled forward on request.
See D20 for the four decisions inside it.

### Tasks

- `Annotation` union in `types.ts`, `annotations?: Annotation[]` on `BoardDoc` — additive and
  optional, so `version` stays `1` and existing documents parse unchanged
- `src/board/annotations.ts` — scene ranges, stroke sampling, the dribble squiggle,
  Ramer–Douglas–Peucker simplification, handles, pruning
- Zone and mark passes in `drawBoard`, split either side of the tokens
- `hitTestAnnotation` / `hitTestAnnotationHandle` in `interaction.ts`, layer-aware
- Tool state on the canvas: a drag draws instead of marqueeing; Escape disarms
- `DrawPanel` — tools, palette, dash convention, scene range, per-shape delete
- zod coverage, including the invariant that a range references real scenes

### Definition of done

- [x] every shape draws, selects, moves, reshapes by its handles and deletes
- [x] a zone is under the players; an arrow is over them, and each takes clicks accordingly
- [x] a shape ranged to one scene disappears on the next, and returns when you scrub back
- [x] deleting a scene keeps the drawing, with the range pulled back
- [x] a document written before annotations existed still parses

### Notes from the build

- **Commit from the pointerup position, not from state.** Committing the draft that the
  pointermoves happened to leave behind loses any shape whose final move never landed, which
  reads as the tool silently not working.
- **Focus after the event, not during it.** Placing text focuses its field from inside a
  pointerdown handler, and the browser's own focus handling for that same event runs afterwards
  and undoes it. `setTimeout(…, 0)` is the fix; `requestAnimationFrame` is not, because it does
  not run at all in a background window.

### Risks

- **Share size.** A freehand stroke is one point per pointer event. Simplified on commit and
  capped at 400 points by the schema, but it is still the largest thing a board can carry.
- **Text hit-testing is approximate.** Text draws upright, so its box is not axis-aligned on a
  rotated board; the hit-test uses a radius instead and over-grabs the corners.

---

## M8 — Board handling

A batch of editor work landed together, out of milestone order. Decisions in D22–D25.

### Tasks

- **Link rows reorder by drag**, with an arrow-key fallback on the grip. Document order is draw
  order, so this is the z-order too (`moveLink`).
- **Two resets.** `Team.formation` moves into the document; "Reset board" keeps the chosen
  formations, "Reset positions" keeps everything except the shape (`resetPositions`).
- **JSON in and out** — `src/share/json.ts` plus `JsonDialog`. Whole board or short setup file,
  one importer, confirmation before replacing the board.
- **The ball's own line** — dashed for a pass, doubled with a strike burst for a shot, gated on
  the new `Scene.shot`.
- **The playhead in the scene strip** — the playing scene is tinted and carries a progress bar,
  separately from the selected one, and scrolls itself into view during playback.
- **Per-label text size** — `size` on a text annotation, a multiplier on `TEXT_SIZE`, with the
  selection box and the hit-test scaling with it.
- **`Scene.hiddenRuns`** — arrows off per scene, per player, from the Selection panel.
- **A drawings rail on the right** — every shape, its scene range, visibility and delete, plus
  drag reordering (`reorderAnnotation`). Collapsed to a 36px strip by default.
- **Shapes can be named** (`Annotation.name`), renamed in place from the rail. Focusing the
  field is the same act as selecting, so there is no separate click to reach the board.
- **Undo/redo** — `useHistory`, snapshots coalesced by gesture key. See D26.
- **One Formations panel** instead of a section per side. They are set up together and read
  against each other; two identical panels stacked was twice the chrome for the same job.
- **Player size defaults to 1.25x** (D18). Tokens at 1x are accurate and unreadable.
- **The drawing rail groups by starting scene**, each group collapsing, with a collapse-all and
  a dot marking a collapsed group that holds the selection. Reordering stays within a group.
- **Reorder shows the gap, not the row.** Dragging a link or a shape draws a line in the gap it
  would land in — highlighting a neighbouring row leaves you guessing above or below.
- **"Shift line" removed** from the Selection panel. Four buttons for something a drag already
  does, on every selection whether or not it was a line.

### Definition of done

- [x] dragging a link row reorders the list and the drawing stack
- [x] reset offers both shapes, and the wide one honours the formations on screen
- [x] a board exports, re-imports and comes back deep-equal; a setup file builds a board
- [x] a pass draws a dashed line, a shot a doubled one, and hiding it removes both
- [x] the scene strip shows where the playhead is while the selection stays on scene 1
- [x] a resized label stays clickable and survives a schema round trip
- [x] a hidden run arrow disappears in that scene only, and the player still moves
- [x] the rail lists every shape with its range, and selecting one ranged elsewhere goes there
- [x] a whole drag undoes in one step, as does a typed name — including from inside the field

### Notes from the build

- **Pair formation slots by order, not by id.** Renumbering a player keeps their id, so the
  `<team>-<number>` ids a fresh `buildTeam` produces need not match the squad at all.
- **The setup form lists players in formation order**, keeper first. Matching by shirt number
  would mean knowing which numbers the preset hands out before you could name anyone.
- **"The ball moved" is not "the ball travelled".** A carrier running with it drags it the
  whole length of their run, so distance alone drew every dribble as a pass. What matters is
  whether the ball changed hands, and to whom — `ballTravelBetween`.
- **A grouped list makes a bad reorder invisible.** Dropping a row on another group's row moved
  the right shape to the wrong index, and the regrouping hid it: the list looked untouched. The
  drop handler has to check the drag started in the group it is running for.
- **Undo needs to know where a gesture ends.** Without a merge key a single drag lands 40
  entries on the stack, and undo becomes a frame-by-frame rewind.
- **A typed size field cannot clamp on every keystroke.** Clamping "150" as it is typed turns it
  into 40 at the first character; the field holds its own text and only commits a value inside
  the range.

---

## M9 — Seamless playback

One checkbox that turns a sequence of tuned scenes into a single continuous movement. D27.

### Tasks

- `BoardDoc.flow` — `{ speed, endHoldMs }`, additive and optional
- `sceneTimings(doc)` as the one timing table, read by duration, scrubbing and scene starts
- Linear movement while flow is on; per-entity travel overrides ignored
- Flow toggle in the transport row; Pace and End hold replace Travel and Hold

### Definition of done

- [x] a long sprint takes longer than a short shuffle, at one pace
- [x] nothing holds between scenes, and only the last frame holds before the loop
- [x] turning it off restores the tuned timings to the millisecond
- [x] the scene strip, the scrubber and the playhead all agree in both modes
- [x] dragging a player still tracks the cursor exactly, at any scene

### Notes from the build

- **Derived timings move under the scrubber.** The scrubber holds an absolute time, so the
  moment an edit changes a transition's length that time points somewhere else — mid-transition,
  where positions are interpolated. The symptom is a player who will not follow the mouse while
  the run arrow moves instead. Every document change re-pins the scrubber to the selected scene.
- **A scene boundary needs slack.** Scene start times go out in seconds and come back in
  milliseconds, and in flow mode a travel is a distance over a speed, so the round trip lands a
  hair short of the boundary and resolves as `moving`. A microsecond of tolerance at the seam
  turns that back into the scene at rest.

---

## M10 — Squad presets and autosave

Out of order, on request: retyping an eleven for every new board was the friction. D30 and D31.

### Tasks

- `share/storage.ts` — the one place `localStorage` is touched. Never throws, every read
  validates, the store is injectable so tests need no DOM
- `share/presets.ts` — a named library of one-team setups, built on `setupTeamSchema`
- `share/local.ts` + `lib/useAutosave.ts` — debounced autosave of the board in progress
- `json.ts` split so `teamToSetup`, `resolveTeamLinks` and `replaceTeamLinks` serve both the
  setup file and presets — one validator, no drift
- `components/SquadPresets.tsx` in the Formations panel, per team

### Definition of done

- [x] save a named squad, change the formation, load it back and get the XI returned intact
- [x] applying to one side leaves the opponent, every scene and the drawings untouched
- [x] a preset applies to Home or Away, and to a board it was not saved from
- [x] saving over the same name in the same formation asks, then replaces in place; the same
      name in another formation saves alongside it
- [x] the library and the board both survive a reload
- [x] editing is quiet for the debounce before anything is written
- [x] hand-corrupted storage yields a fresh board, never a crash — verified in the browser for
      malformed JSON, a wrong shape and a non-array
- [x] a preset naming an unknown formation, an over-deep squad, or a shirt nobody wears is
      refused with a message rather than silently half-applied

### Notes from the build

- **A preset stores shirt numbers, not ids.** Ids are minted per board and renumbering a player
  keeps theirs, so a number is the only stable way a stored file can name a player. The existing
  "formation slots pair by ORDER, not by id" trap is the same fact from the other side.
- **`buildTeam` fills the formation's slots and ignores the rest**, so a 13-player squad saved
  against an 11-slot shape would silently lose its tail. Refused with a message instead, matching
  what the setup importer already does.
- **Changing formation now keeps the squad and drops that side's links** (D32), which was the
  other half of the same friction. `changeFormation` names the intent so it can be tested without
  a component; `applyFormation` stays mechanical so a preset can still bring its own squad.
- **The library is written through on change**, not from an effect watching it, so a failed write
  cannot leave the list on screen disagreeing with the one in storage.
- **Presets are not undoable and never reach a document.** They are a library the board draws
  from, not part of what a board is, so nothing about them lands in an export or a share link.

### Risks

**One browser.** Presets do not sync and clearing site data takes them. Consistent with D7's
no-accounts position; the `.json` export is the way out. If they ever need to travel, they are
already in the shape the share API would take.

---

## Cross-cutting: testing

Vitest, pure engine only, no component tests. This is the first JS/TS test suite in the
portfolio.

| Target | Coverage |
|---|---|
| `geometry` | bezier evaluation, arc-length LUT accuracy, **constant-speed reparameterisation** |
| `timeline` | scene boundaries, `t=0`, `t=end`, holds, single-scene and empty docs |
| `ball` | all five carrier cases, pass timing, moving-target passes, glued offset |
| `links` | chain vs polygon vertex order, distances against known coordinates |
| `schema` | round-trip, invariant violations, oversized and malformed payloads |
| `render` | recording-proxy `ctx` that logs every call; snapshot the command log |

The recording proxy is the interesting one: it tests the renderer with no canvas polyfill and no
image diffing, and it catches draw-order regressions cleanly.

---

## Out of scope for v1

Deliberate, revisit after M6:

- **Real player data.** Wikidata is the only genuinely licence-clean bulk source (CC0,
  `P106=Q937857` with `P54` for club). Every commercial API forbids the bulk-caching a fast
  autocomplete needs on its free tier, and player photos carry redistribution risk regardless of
  source. See `decisions.md`.
- Cones and other pitch furniture
- Five- and seven-a-side (settled: eleven-a-side only, see D10)
- Thirds and final-third crops (half-pitch shipped early, see below)
- Touch support
- Heatmaps and average-position overlays
- Custom domain
