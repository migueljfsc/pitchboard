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
| M4 | Export | MP4 / GIF / PNG out |
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
   chain and a midfield-3 triangle already wired.
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

Goal: MP4, GIF, PNG out of the browser, nothing server-side.

### Tasks

1. **`export/image.ts`** — hi-res PNG at a configurable scale, current frame.
2. **`export/worker.ts`** — the offscreen render loop, progress messaging, cancellation.
3. **`export/video.ts`** — mediabunny wiring, capability detection, the MP4 → WebM ladder.
4. **`export/gif.ts`** — `gifenc` with a palette built once from the board's known colours.
5. **`components/ExportDialog.tsx`** — format (MP4 / GIF / PNG), resolution, fps, bitrate,
   progress bar, cancel.

### Definition of done

- PNG at 4× is crisp; text and line weights scale proportionally
- MP4 at 1080p60 plays in QuickTime, VLC, and a browser
- **Frames from the exported MP4 match the editor preview at the same `t`** — check three
  timestamps including one mid-transition
- Stub the capability check: WebM and GIF both produce playable files
- GIF does not shimmer between frames
- Export of a 20-second animation completes faster than realtime and does not freeze the UI
- Cancel mid-export leaves no leaked worker

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

1. **`share/local.ts`** — `localStorage` autosave with debounce, restore on load, `.json`
   import/export.
2. **`share/urlcodec.ts`** — `#d=<base64url(deflate(json))>` via native `CompressionStream`,
   with a length budget check.
3. **`share/api.ts`** — client for the Worker endpoints.
4. **`worker/index.ts`** — `POST /api/boards`, `GET /api/boards/:id`, static passthrough. Imports
   the app's `schema.ts`. Size cap 256 KB, zod validation, rate-limiting binding on `POST`.
5. **`pages/Viewer.tsx`** — read-only playback of a shared board, with "fork to edit".
6. **`board/migrate.ts`** — version dispatch, running before validation on load.

### Definition of done

- Reload the page mid-edit; work is restored
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
- **Half views orient themselves** (D15). The previous behaviour re-centred the crop at the same
  scale, which is a shift rather than a zoom.
- **Contrast pass.** Muted text was under 4.5:1 on the panel background and borders were nearly
  invisible; both were lifted, along with disabled states and the smallest type.
- **GitHub Pages deploy** (D16), gated on the full check suite.

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
- Full drawing toolkit — pass/dribble/shot line styles, freehand pen, cones, shaded zones, text
- Five- and seven-a-side (settled: eleven-a-side only, see D10)
- Thirds and final-third crops (half-pitch shipped early, see below)
- Touch support
- Heatmaps and average-position overlays
- Custom domain
