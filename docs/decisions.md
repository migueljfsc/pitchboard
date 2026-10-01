# Pitchboard — Decision Log

Why the design is what it is: each entry is the decision and the reasoning that still constrains
the code; how it was reached is in git. Numbers are stable because code cites them — merged ones
are listed in [Merged and retired](#merged-and-retired). The traps are in [`AGENTS.md`](../AGENTS.md).

---

## Foundations

## D1 — Scenes with per-transition paths
A timeline of scenes; an arrow on a player is the curve to his next-scene position, others tween
straight. Pure keyframes cannot curve a run; a Gantt of paths cannot answer "where is everyone
at scene 3".

## D2 — Pure Canvas2D, no library
One `drawBoard(ctx, doc, t, view)`, hand-rolled hit-testing. Konva and SVG rejected: a scene graph
between code and pixels is where preview/export divergence comes from, and export must drive the
same function offscreen.

## D3 — Coordinates in board units, never pixels
Metres on a football pitch; other courts scaled to its length (D113). Pixels or normalised units
put a conversion wherever a distance matters and make export resolution everyone's concern.

## D19 — Stack follows `wtc/ui`, with pnpm
React 19, TS strict, Vite, Tailwind v4, shadcn-style primitives — its ESLint config and
`components/ui/` are reusable. Vitest on the engine only.

## D38 — English and Portuguese, and the engine speaks neither
Hand-rolled: one interpolation form, one plural rule; i18next is more machinery than the job.
`en.ts` declares the keys and `pt.ts` is typed from it, so a missing key fails to compile. Pure
modules return a `Message` (key + variables) — their callers disagree on language — and nothing is
assembled from fragments, since word order is not part of the contract. A document never changes
language with its reader; only a new one is seeded from the locale.

## D9 — Deferred: real player data, other formats
Custom players only: Wikidata is the one clean bulk source, commercial APIs forbid the caching an
autocomplete needs, photos carry redistribution risk. Football is eleven-a-side; the notation
generator parses five and seven but they need a player-count control and a smaller pitch table.

---

## The board

## D11 — Formations come from notation, live on the team, and survive a change of shape
`fromNotation("4-2-3-1")` derives lines, depths, widths, numbers and seeded links; a formation is a
string. `Team.formation` is in the document. "Reset board" starts fresh keeping both formations;
"Reset positions" puts everyone on their marks in every scene and keeps the rest.

**A formation change keeps the squad and drops that side's links** — the new shape's seeded links
are appended, and old ones would stack under them. Ownership is read from the OLD team (a carried
squad keeps its ids). Slots pair by order, not id: a renumbered player keeps his id.

## D13 — Teams can be hidden, and selection is derived
`Team.hidden` removes a side and its links from drawing, hit-testing and selection. Hidden players
are filtered at read time, not cleared, so unhiding restores the selection.

## D18 — What the board looks like is authored
What an export must reproduce lives on the document, and absent draws as before:

- **Player size** — `tokenScale` 0.5–2.5 scales tokens, ball, carry offset, strokes and hit reach
  together; eleven names need smaller tokens than six.
- **Grass** — `grass.shade` moves lightness, never hue (kits were chosen against green).
  `texture: "natural"` is per-pixel noise hashed from position, never `Math.random()`, cached by
  the caller in `RenderView.turf` (a memo, not an input): 13 ms a frame → 5.
- **Goals and ball** — goals seen from above; the ball a shaded sphere that turns with where it
  IS, not with time, so the export worker draws the same frame.

## D37 — Kits: a colour, a pattern, a keeper, and only the palette
A kit is a colour plus an optional pattern (stripes and hoops separate two reds better than a
third red), screen-oriented like the number. A `keeper` kit is always plain — patterns tell SIDES
apart — worn by `keeper.player` or, unnamed, the number 1. The kit is the side's; the player is a
pointer, so the next keeper keeps the colour. An automatic keeper colour avoids every shirt and green.

**Every colour comes from `PALETTE`**, picked from one ball that opens a popover (`ColorPicker`),
whose first entry is the row's "none" (no panel, a link's Auto, no highlight, the team's own kit).
No free colour input: imported kits snap to the palette (redmean; two sides never on one swatch),
so any colour can be picked again and a link matched to a kit. Text colour follows luminance.

## D14 — Timing: per-entity travel and waits, run styles, and flow
`Scene.travel` gives an entity its own duration, `Scene.delay` holds it at its start; the scene
fits the latest `delay + travel`, removing scenes that only ordered two runs.
`scenes[0].transitionMs` means nothing.

**A run chooses its start and finish** (`Scene.run`): gradual, sharp, or runs on through the scene.
Both-gradual is `easeInOutCubic` exactly, so old boards move as before; others are cubic Hermites
with a chosen end slope. "Runs on" rather than an acceleration slider, because hand-matched speeds
always jolt: the runner arrives as the scene rests, sets off at once, and crosses the mark at the
mean pace. `runsThrough` is the only rule — a wait on the next scene, the last scene, a standstill
or flow turns it off. A runner on through moves during the hold, so styled runs are placed by
TIME (`Resolved.ms`), not `u`.

**Flow mode** (`BoardDoc.flow`) runs every transition at one pace, no holds, linearly
(`easeInOutCubic` stops everyone at each boundary even without holds). It ignores `travel` and
`delay`, which the scenes keep for when it is off. Timings derive from positions, so any edit
retimes and the editor re-pins the scrubber.

`Scene.hiddenRuns` hides a run's arrow per scene and player (ball included), never the motion.

## D41 — An edit carries forward through the scenes nobody meant anything by
A drag or nudge applies its delta to every later scene the entity does not travel into: boards are
laid out first, so later scenes are usually copies, and a player snapping back in scene 3 is the
commonest complaint about such tools.

**Each scene is judged against the one before it, never the edited one**, or the boundary depends on
a distance the edit is changing and a second nudge captures a scene the first stopped at. The
mode is fixed at the grab and visible. Positions carry; attention does not (D100).

## D44 — The ball: a carrier, flags on its travel, and its own time
**A pass is a carrier change.** `scene.carrier` names the holder; position is derived while carried;
there is no pass object. A dribble is the ball glued to its carrier, so what the ball DID is read
from the carrier change (`ballTravelBetween`), never the distance.

**No ball until somebody is given it.** A scene names a carrier or stores `ballPos`, never both; a
new board does neither (a ball on the centre spot is a claim nobody made, and it snapped back after
every handover). `ballAt` returns null and every reader checks; a first appearance is not a travel.

**Giving the ball away carries forward** through later scenes nothing happens to the ball in, with
a drag's `Carry`. `"all"` reaches no further than `"stationary"`: a handover has no delta, so
carrying past a pass could only overwrite it.

**`shot` and `loft` are flags on the travel into a scene**, not one enum — a chip at goal is both,
and the gates differ (`canShoot` needs a loose travel, `canLoft` only a travel). `pruneBallFlags`
drops either when its travel stops existing. A lofted ball flies at constant speed (with
`easeOutQuad` it hangs beside the receiver and drops vertically), drawn doubled at its apex flat,
lifted with a shadow in 3D. A shot is doubled rails and a burst, the shaft stopping inside the
head (`SHAFT_INTO_HEAD`).

**The ball keeps its own time, and a pass is met in stride.** "Released after" glues it to the
running passer; "pass takes" is its travel, shown as a speed. It arrives where the receiver IS,
sampled once in `passEnds`, shared with the pass line. With no timing of its own it leaves at once
and arrives as the baseline travel ends.

**It may go in the net.** `clampBall` allows a ball behind the line between the posts, to the
goal's depth; players stay clamped to the pitch.

## D47 — Links are live connectors
An ordered member list plus a style, recomputed every frame from interpolated positions — a
static per-scene shape cannot stretch. Member order is the chain and the perimeter. Every link
starts as a chain (closing is deliberate: right for a midfield triangle, wrong for a front three)
and a chain never closes, or a back four draws an edge across the pitch.

`line` (solid, dotted) and `arrows` (none, forward, both) sit beside the style. A head goes on every
edge in member order and stops short of its token. `animate` marches the dots off render time:
moving in playback and export, still on a paused board.

**A scene range, optional at BOTH ends**, as ids so reordering carries it. Absent is the open end,
so pre-range links show on every scene as they always did — no migration. The rule is in
`range.ts` because links must not import annotations and `scenes.ts` would close a cycle.

## D20 — Drawings are scene-ranged, fixed geometry
Arrows, lines, zones, freehand, text and drawn balls in `BoardDoc.annotations`. A range of scene
**ids**, required at both ends (reordering carries it; `deleteScene` prunes ranges, not shapes);
**fixed geometry** — a drawing depends on nobody, a link is the opposite, and they must not merge;
**two layers**, zones under tokens and marks over; **board units**, so it exports at any size.

- **Outlines** — `filled: false` draws the edge alone; absent is filled. An outline is grabbed by its
  edge, so a click inside reaches the players.
- **Corners** — `polygon` stores corners (dragged out regular, reshaped per corner); arrows and lines
  gain `via`, straight between corners. A box becomes a polygon only on request.
- **A drawn ball is not the match ball** — a prop drawn like it and ignored by everything reading
  the match ball; it stands up in 3D. Props come one small kind at a time; cones are not asked for.
- A drawn arrow's shaft stops inside its head.

## D103 — Labels: a shipped face, measured widths, snapping and a ruler
The one drawing not in pitch space: it stays upright as the board turns, hence `rotated`.

**The face is Inter Bold, self-hosted as `PitchboardText`**, registered by `src/fonts.ts` in the page
and in the export worker. **Widths come from `glyphs.ts`** (the face's advances) with
`fontKerning = "none"`, so wrap, box, panel, handle and hit test read one number and the engine
stays pure. Drawn at 100 px and scaled — at a few pixels Chrome hints advances ~18% wide. The box
hugs the words: a greedy wrap at the widest line's width reproduces the lines, so grabbing the
handle where drawn changes nothing.

**Placing** snaps each axis on its own (⌘/Ctrl frees it): edges or centre onto pitch markings,
other labels, and on a half view the frame's middle. `align` sets lines inside a box still centred
on `at`. **The ruler** shows while moving a drawing flat: it covers the crop, sits on the goal line in
view, shades the drawing's span and marks the crop's middle in metres.

## D100 — The spotlight: highlights, the darkness, and what stays out of it
**`Scene.highlight`** maps id → colour for players, ball, drawings and links. Per scene, **never
carried forward**: a position stands until changed; attention is one moment.

**The rest goes dark**, each lit player in a pool of light: a separate layer with pools cut out
(`destination-out`), so overlapping pools stay lit. Depth `Scene.spotlight` (absent 55%), same in
editor and export, never pulsing. The halo is a billboard, drawn for every entity before any token.

**Highlight and darkness switch together at the START of the move into their scene**, both reading
`Resolved.to`. Easing them on positions lit a long run only as it ended and dimmed the lit
player mid-move.

**A lit drawing or link keeps its place in the stack**: a glow in its colour just under it (soft
bands; a canvas shadow blurs in device pixels) and a hole cut to its shape — never redrawn on top,
or a lit zone covers its players. Deletes prune keys through `withAnnotations`/`withLinks`; the
spotlight asks `lightsAnything`, not the key count.

**Text is always above the darkness.** **A drawing or link can be `lit`** — out of the dark on
every scene, no glow, cut by its own pixels (`drawKept`); translucent zones and filled links have
their area cut clean (`keptAreas`). `lit` never darkens a scene; a highlight on it wins.

## D12 — Framing is presentation, never document state
`PitchView` (half, rotation, tilt) lives in editor state as one affine `Viewport`; everything
downstream stays in units. A half view is a CLIP, not a re-centring. Tilt is applied by
`framingOf`, never written to `rotated`, so the flat orientation survives 3D; it forces a vertical
board. What travels with a share link is D7.

---

## The editor

## D26 — Undo is a stack of snapshots, coalesced by gesture
`useHistory` keeps whole documents, capped at 60; engine functions share what they did not touch,
so an entry costs a pointer. A drag emits a document per `pointermove`, so entries merge on a
gesture key or one drag is forty steps.

## D93 — The editor's shape: play left, drawing right, and it explains itself
The left sidebar is the play — formations, links, selection (reshaped by D125); the right rail is
the drawing — tools and style above, the list below. The rail opens when a tool is armed or a shape
selected, following rendered state rather than each handler. A shape's style rows appear in its
card, or a "next shape" card for the armed tool, and nowhere with neither.

**Everything that deletes or replaces work goes through `notify`**, offering Undo. The command
palette (⌘/Ctrl+K) lists every panel action.

**A tour, once** — cards on `data-tour` anchors (centred when hidden), on the first visit and on
request, re-shown when it grows (it stores the version seen). It runs on its own board
(`buildTourBoard`): the editor draws `tourBoard ?? savedDoc`, and history, autosave and sync are
bound to `savedDoc`, so the coach's board is never touched; view state is restored and undo
refused while it is up.

## D34 — The 3D view is a homography and two passes
`ctx.transform` is affine and a trapezoid is not, so the view warps a flat ground layer —
`pitch.ts` never learned about the camera. The **ground** takes the perspective; **billboards**
(tokens, ball, halos, text, drawn balls) stand off it and join that pass explicitly. Goals are the
only thing with height, depth-sorted by being drawn at either end of the billboard pass. ONE camera,
`cameraFor`, for renderer and hit tests. A full pitch projects nearly square; export follows.

## D91 — Everything the flat board edits, the 3D view edits
Every pointer point is unprojected to units first, so nothing under the camera is special once
flat. `unproject` inverts exactly and is NaN above the horizon; one `onGrass` check covers every
consumer — a drag holds, a release commits its last good move. Hit-testing splits as drawing does:
grass through `unprojectPitch` and the flat tests, standing things through `unbillboard` in their
own space — which answered the grab-margin objection that once kept 3D read-only. A label's handles
live in its billboard; a marquee is a region of pitch. Accepted costs: up-pitch precision ~1.5×
coarser than across, and a circle scribbled in 3D is an oval flat.

---

## Storage, sharing and export

## D23 — Two JSON shapes, one importer
`share/json.ts` takes a whole `BoardDoc` or a **setup** (formation + XI), told apart by `version`. A
setup is built into a board and validated as one — one definition of renderable. Duplicate shirts
a file states are rejected; ones we created are resolved.

## D31 — Browser storage is untrusted, and never throws
`share/storage.ts` is the only place `localStorage` is touched; every read validates and returns
null on failure. Stored data outlives versions and can be hand-edited, so it is discarded, never
repaired.

## D30 — A squad preset is one team, and there is one library
One side: formation, kit, the XI and its units, players named by **shirt number** (ids are per
board). Signed out, the library is the browser's; signed in, the account's, one D1 row per preset
so two devices never overwrite each other. **Never both**: nothing cached locally while signed in,
offline shows nothing — a second library is one nobody reads and everybody must merge. Adoption is
offered once per sign-in, deduped by name and shape, clearing the local copy only once all landed.
Bodies are opaque to the Worker and validated in the browser.

## D7 — Two ways to share: a frozen link, and an account's live one
**`#d=` links are immutable snapshots** — `#d=<base64url(deflate-raw(json))>`, decoded by the page,
never sent to a server, opened read-only with fork as the way out. Ten scenes with a path on every
player is ~3,300 characters; freehand blows the budget and the dialog says so. The crop rides in
`v=`, never in `BoardDoc` (no migration; old links open); rotation and 3D are the viewer's. `origin`
is left out. A hash change does not reload, so the page listens for it.

**A published link follows the board.** Publishing mints `/share/<slug>` pointing at the board row,
showing it as it is now. Withdrawing clears the slug; republishing mints a new one, so a withdrawn
link stays dead. `GET /api/shares/:slug` is the only sessionless route. The two never meet.

## D39 — Accounts, projects, and mutable boards
Users own projects; projects hold mutable boards; users, projects, boards and presets are in D1.
KV is provisioned and unread.

**Projects nest** by one nullable self-reference — ≤25 rows, fetched whole; a folder shows everything
beneath it. The Worker, which sees the whole tree, guards: no folder under its own descendant, and
depth ≤5 as the new parent's depth plus the moved subtree's height. Every recursive walk carries
`n < WALK_LIMIT` (a CTE over a cycle does not terminate). Delete cascades through subfolders and the
confirmation counts them. `buildTree` files orphans at the root and breaks cycles — its rows came
over the network.

## D6 — Export: mediabunny and gifenc, sized to the board
Video by mediabunny, GIF by gifenc, by capability check; `mp4-muxer` is deprecated and
`MediaRecorder` is realtime and drops frames. The worker renders with `drawBoard`; cancelling
terminates it.

- **Size follows the board**, not 16:9: a preset sets the long edge, both axes even. `square` or
  `wide` letterbox the board on a vignetted surround.
- **The GIF palette is quantised once** from sixteen sampled frames, or the greens crawl. Delays are
  differences of rounded cumulative times, or a 30 fps clip runs short.
- **A caption is view data** — title and scene name drawn by `drawBoard` in screen space.
  `transparent` leaves the surround unpainted for PNG; video has no alpha.

## D40 — Hosting: one Worker, OpenTofu for durable things, CI for the deploy
One Cloudflare Worker serves the assets and `/api/*`; D1, KV and R2 are OpenTofu. The deploy is
not: a Worker with assets needs a completion JWT, expiring in an hour, obtained by uploading
`dist/` first — Terraform can neither produce nor hold it. `deploy-worker.yml` deploys from `main`,
gated on lint, typecheck, tests and build. The API token is made by hand: a stack owning its own
credential can revoke itself mid-apply.

**A domain bought through Cloudflare Registrar** (wrangler `routes` with `custom_domain`), because
email needs one (D109); its records are in the stack. `workers.dev` is off — one origin for cookies,
OAuth and Turnstile. The GitHub Pages copy was retired: no server, no accounts.

## D108 — The operator's view: `/admin`, metadata only
Totals, the accounts, and one account's projects, boards and presets; its one write erases an
account (D110). Linked from the account menu when `/api/me` says `admin`. **Gated by `ADMIN_EMAILS`**,
a secret, against the session's verified email; anything under `/api/admin/` answers **404** to
anyone else, so it cannot be found by probing. **Metadata only** — counts, dates, sizes, computed in
D1 so no document enters the Worker; opening someone's board is reading their work, not measuring
use. `last_login_at` and `last_seen_at` are columns (`0007`) because sessions die; `last_seen_at`
rides the daily session slide. Anonymous use never reaches the server. English only, lazy-loaded;
hand-drawn SVG charts (90 UTC days of sign-ups and boards, sign-in methods, last-seen recency), each
with a table view, colours validated against `ink-800`.

## D109 — Email and password: the KDF runs in the browser, and no account is unverified
**The expensive half of hashing runs client-side.** PBKDF2-SHA256 costs ~0.27 ms CPU per thousand
iterations on the edge — 100k took 26–30 ms against a 10 ms free-tier budget. So the browser
derives a key at 600k iterations (OWASP), **salted with `pitchboard:v1:` + the normalised address**
(Bitwarden's scheme; no endpoint has to say whether an address exists). The Worker stores
`v2$salt$HMAC(PASSWORD_PEPPER, salt$key)`; the pepper is a secret apart from D1, so a leaked table
cannot start a guess, and each guess still costs 600k iterations. Unpeppered `v1` rows verify and
are rewritten at next sign-in. Losing the pepper resets every password account. Every constant in
`src/share/password.ts` is load-bearing and frozen by a test vector. Workers Paid and AWS were
rejected as cost for a problem the browser solves free.

**Registering never creates an account.** The hash waits on a single-use `email_tokens` row; the
`users` row is written when the emailed link returns, so every address is proved — which keeps
joining a Google sign-in by email safe. Registering an existing address sets the password through
the same link (how a Google account gains one). A password set by link ends every other session.
Links go to the page (`/?verify=`, `/?reset=`), which POSTs them, because mail scanners follow
GETs. Register and reset-request answer `ok` before any lookup (`waitUntil`); sign-in says only
"wrong email or password".

**Abuse:** mail-sending routes take Turnstile; every auth route is rate limited per client and per
address (`AUTH_LIMIT`); bodies must be `application/json`, which a cross-site form cannot send
without preflight — the login-CSRF guard. **Mail is Resend** from `noreply@<domain>` (Cloudflare's
Email Service sends to arbitrary recipients only on Workers Paid); DNS in the stack.

## D110 — Deleting an account is one transaction, by name
`DELETE /api/me` empties every table naming the user — presets, boards, projects, identities,
sessions, the address's pending email links — then `users`, in one D1 batch: gone or untouched. The
list is the contract; `ON DELETE CASCADE` is a backstop for a forgotten table. Shares go with their
board row (D7). The request repeats the address, which the coach types — an irreversible delete
that kills other people's links is not one click. It exits through `/?fresh=1` so the open board is
not autosaved back. The operator erases from `/admin` (`DELETE /api/admin/users/<id>`, same 404) for
emailed requests: same `eraseAccount`, address typed, id logged only.

## D111 — The ball is played by dropping it where it goes
A shot took six steps. **Dragging the ball alone plays it** (`playBall`): dropped on a player within
a token's radius he is given it (pass or turnover, read from the carrier change); elsewhere it is
set loose; into the net that travel is also a shot, behind `canShoot`. Only the net infers a shot
— on the keeper it is a save or clearance and stays a toggle. On its holder nothing happens. Every
move is played from the document the drag STARTED from, so passing over a player leaves no carrier,
and the gesture is one undo step with the drag's carry (D44). In a multi-selection the ball moves
with the unit. Under the camera the receiver is his billboard. Shot and Loft are on the ball's
right-click menu; `N`/`B` add a scene and give or take the ball. Dragging never adds a scene.

## D112 — Select is the default tool; Pan exists only when there is somewhere to pan
At 100% Pan did what Select does. Select is the default and where Esc lands; Pan is shown, and `H`
arms it, only while zoomed, and reads as Select once the zoom is gone (`activeTool`). Drawing tools
have letters (V A L R O G P T); the drawn ball has none (`B` gives the match ball). Delete removes
selected players as it removes a shape, one undo step behind a toast. The export dialog keeps its
settings per browser (`exportPrefs.ts`), each field validated; caption words are the board's. Share
tabs are Snapshot and Live link (D7).

## D113 — One engine, many sports: courts in board units
A board names its sport (`doc.sport`, absent = football). Scenes, runs, ball, links, drawings,
highlights, 3D and export are shared; what differs is one `SportSpec` per sport (`sports.ts`) —
court, surface, goal, keeper, label snaps, 3D headroom. Call sites read the spec; none branch on a
name.

**Every court is stored at football's length, in board units.** ~50 sizes and thresholds (token and
ball radii, strokes, handles, text, snap and drag distances, padding, the 3D camera) were tuned in
metres on 105 m; scaling the court leaves them all right everywhere and football exact
(`metresPerUnit` 1). What a person reads converts back through `toMetres`: link distances, the ruler
(ticked per metre), pass speed, flow pace (m/s). Basketball's 28 × 15 m is 105 × 56.25 units.

**Basketball (FIBA)**: planked floor, painted key, three-point line, circles, rings drawn from above
flat and standing in 3D — a ring is inside the court, so depth-sorted among the players by its
backboard, with extra far-end headroom. Five a side, no keeper kit, zones (2-3, 3-2, 1-3-1, 1-2-2,
Box-and-1) numbered by position. A ball dropped within reach of a ring goes through it and is a
shot (D111), ahead of any player under it.

**Switching sport starts a new board.** An untouched board (`isUntouched`) is replaced; one with
work asks first; one linked to the account is never replaced in place (its autosave would carry the
new sport over it) — a fresh local board opens. The last sport chosen seeds new boards, per browser.
Presets are one library tagged by sport, shown on their own; setup files carry the sport.

**Handball** (IHF, 40 × 20 m) and **field hockey** (FIH, 91.4 × 55 m) needed nothing new in the
engine: nets, so shots, the drag into the net and the 3D goal are football's, sized by the spec.
Handball: hall floor, gold goal area, 6 m line, dashed 9 m (clipped at the sidelines), 7 m and 4 m
marks, seven a side with defences (6-0, 5-1, 3-2-1, 4-2, 3-3) bending round the goal — so a line may
give each player his own depth. Hockey: blue turf on a green run-off, 23 m lines, shooting circle
and dashed outer circle, penalty spot, eleven from notation. Each sport has its own ball and glyph.

**Volleyball (FIVB)** has no goal (`goal.kind` "none"; Shot is a toggle for a spike) and a net across
the middle, standing in 3D and sorted by the centre line. Its board is the 18 × 9 m court plus the
3 m free zone, 24 × 15 m, lines inset (`SportSpec.court`): players clamp to the board, so a server
stands behind the end line. Six a side, numbered by rotation, a base rotation and two serve-receive
shapes. Ice hockey: D123.

The sport picker is a title (icon, bold name, chevron) opening a panel of line icons (`SportMenu`),
its own listbox since a native option cannot hold an icon, keeping arrows, Enter, Esc and focus
return; its keys stop there. UI copy says board, space and goal for pitch, grass and net.

## D114 — The library is filed by sport
One folder per sport at the root of every library, and nothing else there: every folder is under a
sport; a board is filed under its own sport only. Roots are real rows (`projects.sport`) so a coach
can save straight into "Basketball"; the Worker creates missing ones when projects are listed, so a
new sport reaches every account unasked, safe under two tabs by a partial unique index on
`(user_id, sport)`. A root cannot be renamed, moved or deleted (`project_locked`); nothing is made
or moved to the root (`parent_required`); nothing crosses sports (`wrong_sport`) — creation reads
the document's sport, a move compares it in SQL (`json_extract`, the document never leaves D1), a
bulk move with one stray moves none, a save may not change sport. `worker/lib/sports.ts` mirrors
the sport list, held to the app's by a test.

Roots count against neither the 25-folder nor the depth cap. Older folders moved under Football
(migration 0009). Each sport has its own Templates folder, made on first save; the template menu
reads the open board's sport. The library hides an empty root; the save picker shows only the
board's sport. A board adopted on sign-in goes into its sport's root.

## D115 — A sweep: crash screen, keyboard menus, link previews, the board's language
**A crash is a screen**: one error boundary; it says the board is safe, offers the stored board as
a file (raw, validated or not — it is still the coach's work), then a fresh start.

**Every menu works from the keyboard.** `ContextMenu` takes focus, moves with arrows, closes on Esc
and Tab, and returns focus only where nothing else took it; its keys stop there.

**Links unfurl.** `index.html` carries description and preview tags. `/share/<slug>` is the one
page path the Worker answers (`run_worker_first`): the app's page with the board's name in title
and tags (`sharePage`), escaped — it is the owner's typing on a public page. `#d=` keeps the app's
title. No preview image yet.

**What the board writes is in the board's language.** A seeded link is named in the board's
language by `LineNamer` (English by default); ids stay English, so they never change; old boards
keep their names (D38). Formation headings show in the reader's language (`formationText.ts`).

**Every sport has templates**, three beside football's four (`SPORT_TEMPLATES`), written in rulebook
metres, home attacking right; the menu offers the open board's sport's.

**The video importer loads on submit** (`TracksReader`): ~18 KB off every first load.

## D116 — A sweep: presenting is read-only, security headers, gaps from a walk-through
**Presenting edits nothing.** The key handler answers Space, Esc, arrows (step scenes, as a clicker)
and brackets, and returns before any editing key — Delete and N used to fire in front of the room.

**Security headers on everything.** One list (`worker/lib/headers.ts`): a CSP whose only third
party is Turnstile, `frame-ancestors 'none'`, nosniff, referrer and permissions policies. The Worker
sets them on every response (`secured`); the build writes the same into `_headers` for the asset
layer. A new third-party origin goes there or production alone breaks.

**Links are filed by side** — Home and Away tabs, plus Both while a link spans them. A seeded link is
named for its line ("Back 4"); older boards keep "Home — Back 4", shown without the side.

**Export picks its scenes** (`sliceScenes` drops a drawing or link seen on none, rather than widening
it) **and previews what it makes**, looping through the export's own view. A PNG can be a sheet of
the chosen scenes at rest, named (`renderSheet`). The dialog is anchored at the top; the caption
comes last and starts off each time.

**The File menu is where a board starts and ends**: New (an account board is left and a fresh one
opened), Open, Save a copy, Import, Export. Picking a tool on the folded rail opens it. Football gains
kick-off, free kick and throw-in templates. The viewer plays ½×–2×, presents, steps with arrows and
downloads through the export dialog. An untouched board shows a where-to-start card under Help,
gone with the first change.

## D117 — Futsal, second after football
A sport like the others (D113) — spec, court (`futsal.ts`), formations, templates, ball, icon, each
in a table by sport. Second in `SPORT_IDS`, so in the menu and the library's roots; the root is made
on first listing, no migration (D114).

**FIFA Law 1, 40 × 20 m.** The penalty area is handball's shape (`traceGoalArc`) struck at 6 m about
the OUTSIDE of each post, so the joining line is 3.16 m. Marks at 6 and 10 m (with marks 5 m either
side), 3 m centre circle, 25 cm corner arcs, substitution zones 5 and 10 m from halfway on the bench
side. Goals 3 × 2 m.

**Five a side with a keeper**, 1-2-1, 2-2, 3-1, 4-0; a new board is a diamond against a square. Lines
named as the game does — fixo, wingers, pivot. Plays: 3-1 rotation, fly goalkeeper 5v4, a corner.

## D118 — A front door, and motion with a vocabulary
**`/` is a landing page; the editor is `/app`.** It plays real boards through `LiveBoard`
(`drawBoard` on a loop, surround transparent), demonstrating rather than describing. Signed-in
visitors skip it: `main.tsx` redirects before React mounts on a `signed-in` hint
(`share/signedIn.ts`; a wrong hint costs one page). Anything the editor must act on — `?welcome`,
`?verify`, `?reset`, `?auth_error`, `?fresh` — passes through (`wantsApp`), so old emails work. `#d=`
opens wherever it points. The logo goes to `/?home`, which shows the landing page to anyone
(`wantsHome`). Signing out lands on `/?fresh=1`, the landing page; a fresh board is `/app?fresh=1`.

**Motion goes through `motion` and three speeds.** `lib/motion.ts` and the `--duration-*`/`--ease-*`
tokens are the vocabulary: arrive on an ease-out, leave faster. Every dialog is `ui/Modal`, animated
out inside `AnimatePresence`; `MotionConfig reducedMotion="user"` and one CSS rule honour reduced
motion. Animation never reaches the document or an export: the selection ring's settle is
`RenderView.focusIn`, a number the caller drives, absent on export.

## D119 — Counting everybody's use, anonymously
Accounts are optional, so most use was invisible. `usage_daily` keeps one number per UTC day per
event — a page opened (landing, editor, shared board), an export by format, a share (snapshot or
live), an import by kind, a presentation. It names no person, session, device or board, so it is off
`deleteAccount`'s list (D110); `/admin` shows it under **Everyone**.

**The one unauthenticated write**, bounded three ways: a fixed event list (`USAGE_EVENTS`, mirrored
in the browser, held by a test), a rate limit keyed by address (read, never stored), and a per-row
cap past which the upsert writes nothing. Fire-and-forget; a page view counts once per load in
`main.tsx` (not an effect StrictMode runs twice). Cloudflare Web Analytics was rejected: a
third-party script, a CSP change, page views only. The privacy page says what is counted.

## D120 — Housekeeping: a daily sweep, pages as chunks, your data as a zip
**A daily cron** (`wrangler.jsonc` → `worker/lib/cleanup.ts`) deletes expired sessions and tokens and
usage rows older than `USAGE_KEEP_DAYS`; before, unreturned ones stayed forever.

**Each page is a lazy chunk** (landing, editor, viewer, admin): main bundle 577 kB → 277 kB.

**Everything an account holds, as a zip**, built in the browser from the library's own endpoints a
board at a time — no export route. Filed by sport and folder as the File menu writes them, so each
re-imports; presets beside them. `share/zip.ts` writes over `CompressionStream` with UTF-8 names,
checked by a real unzipper.

## D121 — A note per scene
`Scene.note`, optional, ≤500 characters, stored as typed; emptied, the field is removed, so a board
without notes serialises as before. A new scene starts without one; a duplicate copies it.

Shown where a board is watched: under it in the viewer (a strip that stays once any scene has a
note, so the board does not jump), in the presenting card, and in an export caption on request,
wrapped by `wrapLines` (pure, tested with a fake measure) to part of the width and four lines.

## D122 — Formations drawn by hand
A shape dragged into place had nowhere to be kept. `TeamShape` is a slot per player, keeper first,
as fractions of the board for the side defending the left goal (`depth` from its goal line,
`across` from the top touchline), so it lays out for either side, mirrored, on any board of its
sport. Units kept by slot, in chain order.

**The document carries the shape; the library only offers it.** `Team.shape` stands in for
`Team.formation` — one or the other — so reset, share links and export need no library. Saving
(`shapeOf`) captures the active scene and moves nobody (`setTeamShape`); picking one is a formation
change. It travels through `TeamSpec` at all three builders, so a squad preset keeps its shape.

**The library twins the squad library** (D30): browser signed out, the `formations` table signed in,
never both, adopted on sign-in in the same dialog; on `deleteAccount`'s list and in the zip (D120).
A name already kept in the sport asks before replacing; a board using the old shape keeps its copy.

## D123 — Ice hockey, with goals on the ice
The IIHF rink, 60 × 30 m with 8.5 m corners: spec, rink (`icehockey.ts`), formations, templates,
puck, icon. `ICE_RINK` holds the rulebook: goal lines 4 m from the boards, blue lines 15 m apart
(22.5 m from the boards — not the NHL's 75 ft), 4.5 m face-off circles, end-zone spots 6 m out and
7 m either side, neutral spots 1.5 m inside the blue lines, the keeper's trapezoid (6.8 m at the
goal line, 8.6 m at the boards), 1.83 m crease, goal 1.83 × 1.22 m.

**Goals stand on the ice, with play behind them.** `NetGoal.line` is how far in the goal line is,
absent being the end, so no other sport moved. A goal is then the net's footprint (`goalAt`): a
puck behind the line beside the net is in play. The puck may go anywhere (`clampBall`); in 3D the
net is sorted among the players by its goal line, as a ring by its backboard.

A goalie and five skaters: defence 2 and 3, wings and centre 4–6, in a 2-3, a defensive box-plus-one,
and neutral-zone 1-2-2 and 2-1-2. Plays: breakout from behind the net, 1-2-2 forecheck, an offensive
face-off won to the point. The ice takes the board's shade only; its line red frames the goals.

## D124 — The shared board looks like the app, and the front door loads at once
**The viewer** wears the editor's bar: the mark to the landing page, quiet buttons and one filled
("copy to edit", the one thing a recipient is invited to do), language and coffee last; the
editor's play button and scrubber (`ui/PlayButton`, `.scrubber`); scene buttons sharing one sliding
highlight. Splash and error screens match.

**The landing page never starts invisible.** A script-faded headline was measured late and, in a
background tab or to a crawler, waited at zero opacity forever. The headline draws at once; the rest
fades up in CSS or reveals on a scroll timeline, and is simply there where neither runs. Showcase
boards draw at 30 fps and stop while hidden.

**An empty list says what to do next**: an empty sport folder offers to save the board there; an
empty squad library is a button to save this side; a side with no links can have its formation's
lines back (`seededLinks`, pairing by order).

## D125 — The left sidebar: setup above, one Selection card below, the view on the board
**The setup scrolls; the selection fills the rest.** Formations and Links scroll as one block as tall
as they are; Selection takes the remaining column, so nothing moves as the selection changes. Every
section folds from a header that reads as a control (chevron in its own box, sticky). Formations no
longer fold when something is selected.

**How the board is looked at is on the board.** 2D/3D, turn, crop and ghosts are a vertical bar
beside the pitch (`BoardViewBar`); player size and surface are in its popover. Dragged by a grip,
foldable, reset by a corner button; its place is this browser's (`share/viewBar.ts`). Reset positions
is in Formations, the File menu and the board's right-click menu.

**Selection is one card.** Who it is (token, name, number), one-tap actions (ball, glow, path,
arrow), the run into this scene folded behind a summary, and what applies in every scene (keeper,
side, removal) under a title saying so. How far a drag carries (D41) is a menu in the card's header,
always in view. Nothing selected is one line. Each part of the card that folds is one box, its
header and body inside one border, so what folds reads as inside what it folds under; the run and
"in every scene" start folded, their summaries saying enough to decide whether to open them.

**A link picked on the board is edited in the card** (`LinkCard`, the list's `LinkEditor`). A pick
selects the members first, then names the link; the card shows it while the selection is exactly
its members, so any other click hands the card back. Adding members stays in the list.

**The squad is a list in Teams**: a token selects the player, name and shirt edit in place, arrows
skip to the next free shirt. Rows keep the team's order and never reorder — it is the formations'
slot order (D11); a re-sort looked like players arriving, and a drag would decide who stands where
on the next reset.

## D126 — A visual identity, and the editor's bottom half
**The chrome is the ground the pitch sits on.** The `ink-*` scale is dark grass, not near-black.
**Chalk** (`--color-accent`, `#eef1ea`, the pitch lines' colour) marks primary actions and what is
selected; it is no kit's colour, which is the point — the amber accent was the home side's default
kit, and the canvas selection ring vanished on it. Amber now means the home kit, the ball and
warnings. The selection ring is chalk on a dark keyline, editor-only, so exports are unchanged.
**Crema** (`--color-crema`) is worn by the coffee link alone, so it is noticed without shouting.

**On is a filled, outlined tile; off is not** — `bg-accent/15` and a 70% chalk border (or inset ring
where a control has none). A colour change alone failed twice: chalk against grey, then a lime
`--color-on`, both read the same as off. Pick-one sets in the view bar sit in a recessed well.

**The UI face is Archivo**, self-hosted as a variable font: its width axis is the voice — the
landing headline in the wide, heavy cut (`DISPLAY`, passed to `cn` after any size class, which would
otherwise merge its leading away), section headers semi-condensed. The canvas label face is
untouched (D103). Labels are sentence case; all-caps tracking is gone. Every select draws one inset
chevron from a base rule, and `color-scheme: dark` opens native popups dark.

**The landing page shows the board, not a frame around it**: the headline full width, the hero board
at the content width, features as alternating text-and-board rows. Pill labels, gradient text,
glows and the card grid are gone.

**The board sits on the page.** `BoardCanvas` passes `transparent`, so in the editor and the viewer
the surround is the chrome; in 3D
the depth shading goes on `source-atop` and darkens only painted pixels — identical on an opaque
export frame, and no dark box on a transparent one.

**The scene's own fields are at the bottom, in reach whatever is selected.** Its name and note sit
beside the track and previews (`SceneIdentity`), so the scene in view is next to what it is called
— the note a fixed box that scrolls, since one sized to its text widened the column and pushed the
previews away; timing,
spotlight, the ball's part in the travel in, and moving, copying or deleting it are one row under
them (`ScenePanel`), which takes the name and note back while the previews are folded. Putting them in the Selection card when nothing was selected was tried and
reverted: having to click away to edit a scene was confusing.

**The timeline is a transport and a scene track.** One block per scene, as long as it lasts (travel
striped, hold solid), laid under the scrubber so its edges meet the thumb: click to select, drag
onto another to reorder, drag an edge to retime. Previews of each scene can be shown under it — a
per-browser choice (`share/scenePreviews.ts`) — and the dashed add-scene slot follows the last
scene. The board gained about a quarter of the editor's height.

**Smaller:** the team row says "Attacks →" and "Hide this team" in words; a link under the pointer
shows the pointing hand, on otherwise empty grass, as a click reaches it. Pending: Formation and
Squad preset as one line-up block.

---

## The importer (`src/import/`)

A board from the sibling `football-tracks`' `tracks.json`. Every rule was measured through
`pnpm board` on its clips and checked against the video; numbers are in git. Over all of them:
**an invented event is the most expensive output**, because it is drawn as football and reads as it.

## D73 — The importer never judges whether the football is any good
The coach chose the clip; ranking passages by progression or shots decides for them. The importer
may weigh whether it represents the clip, never whether it is interesting. A clip whose ball cannot
be attributed stays ball-less.

## D52 — Measurement noise is not football
- **A one-frame speed is a position error times fps.** An impossible jump needs the step AND a
  three-sample baseline either side; the step alone shattered a 48 fps clip into 5× the fragments
  and a board that validated, scored best, and held no curved run. A good score on a short board is
  the symptom.
- **A track is not a player.** `splitImpossible` runs first and id switches split often (56 tracks
  → 147 pieces); anything counting tracks counts fragments. A side holds `MAX_PER_SIDE`.
- **A run shorter than the camera's error is noise** (`STILL_M`) — a third of arrows were a standing
  player wobbling. Compare with where he was last DRAWN, so a real slow drift accumulates.

## D81 — The board is the whole clip, and its roster is a cover
**The window is the whole clip.** `positionAt` HOLDS a player at his first or last sighting, which
is honest, so trimming to where most of the roster is visible bought nothing and cost half the
play. Every clip fields eleven a side; the only bar is `MIN_OBSERVED_S`. Ends are trimmed only where
NOTHING was seen; a ball event pins the window only where somebody is visible. `restartAt` opens on
a corner or kick-off it finds; free kicks have no canonical spot.

**The roster is a greedy set cover, not a ranking.** On a ball-following camera "seen longest" means
"where the camera settled", which cut the players pressing a keeper. `bestCover` takes whoever adds
most unseen clip, keeps filling once covered, and counts coverage as depth (1/(1+n)), not a flag, or
a press loses its shape. **Players the ball goes through are reserved** (`onTheBall`), like a
restart's taker, or the pass lands on grass.

**The limit is slots.** A side can make fifteen appearances for eleven places; weighting by ball
distance changed the order, not the set. The ways out are upstream joining or leaving a player out
of a scene.

**What the numbers mean.** `seen` and `dens` count positions backed by a live sighting (`witnessed`,
never `coverage`, which calls a two-second gap covered). They fell with the whole-clip window —
read them with the roster: 11 v 11 at 48% beats 5 v 10 at 69%. Honesty, roster and ball cannot all
be optimised; each ordering sacrificed the third. A fidelity rule never touches an event. Several
boards per clip was built and scrapped: a clip is one play.

## D71 — Who has the ball
- **The carrier is whoever KEEPS it** (`HOLD_S`, `HOLD_SHARE`), within `SNAP_M` at least once. `z = 0`
  lays a lofted ball's shadow across everyone it flies over, and speed cannot tell a fly-over from a
  reception — half of real receptions arrive above 9 m/s.
- **A one-touch pass is a change of direction** (`touchedAt`), with speed both sides so noise cannot
  fake a right angle, and the body within `SNAP_M` (a post bends a ball too). Events get their own
  0.2 s scene gap.
- **A turnover handed straight back never happened** (`steady`, across sides only); a change of side
  is seen twice; a keeper in his box is exempt (a catch is silent); a tackle the tackler does not
  come away from is not one (`contested`).
- **A holder is judged against the field**: if somebody was nearer at every sighting (`takenFrom`),
  it is not his.
- **A holder's silence expires** (`CARRY_S`), measured backwards only.
- **Anyone named must have been THERE.** `positionAt` clamps, so every rule naming a player
  (`nearestTo`, both backfills) checks his track's span; the kicker backfill stops at the last scene
  somebody was named at.
- **An unreadable track BLOCKS the ball** — stepping over one gave a keeper's pass to an opponent.
  `referee` does not.
- A pass two metres from a defender is beyond the camera model; it needs evidence upstream, not a
  rule here. Possession ground truth is itself a z = 0 reading, so a person watching outranks it.

## D75 — The ball is evidence, not only a pointer at a player
- **The moment it comes loose is a scene** (`flights`); a sighting far from the holder ends his
  possession (`leftBehind`). A flight with a player at both ends is one pass held by the KICKER
  (`kickedBy`); only a shot, the ball out, or a pass to an untracked player is drawn at the ball.
- **Its silences are events** (`breaks`): both ends of a gap it moved across — the departure only
  where somebody still had it, or a pass in flight splits in two.
- **Behind the line between the posts is a GOAL** and stays in the net; elsewhere off the field it
  is a bad fit, dropped.
- **A loose ball is drawn at the nearest player's feet** within `SNAP_M`, unnamed — 1.5 m is the
  camera's error, and a pass into the gap reads as into space.
- **A ball in the air is not where it is drawn** (`airborne`): its projection bows up to 10 m from the
  near touchline. Both tests are needed, the bow and `MAX_AIR_S`.

## D87 — A player nobody saw is drawn faded, in his own colours
`Scene.unseen` lists players with no sighting within `WITNESS_TOL_S`; drawn at `UNSEEN_ALPHA`,
filled (hollow is a ghost), with a dashed rim in the kit colour. Document, not view, so exports
show it. Dragging a faded token clears him for that scene; hand-drawn boards have none.

## D88 — A board from video remembers what the importer said
`origin` holds per scene id the frame, carrier and positions chosen, per player id the track, span,
side and number. `ft learn` diffs a coach's exported board against it and keeps his corrections as
labels. Ids are the keys because they survive reordering; `switchSide` keeps a player's id for this.
Left out of share links, kept in JSON export.

---

## Merged and retired

D4→44 · D5→47 · D8→40 · D10→9 · D15→12 · D16→40 · D17→19 · D21→47 · D22→11 · D24→44 · D25→14 ·
D27→14 · D28, D29→6 · D32→11 · D33→7 · D35→7 · D36→12 · D42→14 · D43→44 · D45→44 · D46→30 ·
D47 (highlights)→100 · D48–D50→91 · D51→39 · D53, D54→81 · D65→71 · D66–D68→81 · D69→52 ·
D70→81 (scrapped) · D72, D74→71 · D76→75 · D77→37 · D78→71 · D79→75 · D80→81 · D82→81 · D83→75 ·
D84–D86→71 · D89→18 · D90→37 · D92→87 · D94→6 · D95, D96→20 · D97, D98→44, 14 · D99→47, 20 ·
D101→93 · D102, D104, D106→100 · D105→103 · D107→37. D55–D64 were never assigned.
