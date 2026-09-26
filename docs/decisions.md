# Pitchboard — Decision Log

Why the design is what it is. Each entry states the decision and the reasoning that still
constrains the code; the history of how it was reached lives in git. Numbering is stable because
the code cites it: related decisions were merged into one number, and the ones folded away are
listed in [Merged and retired](#merged-and-retired) so an old citation still resolves.
Operational consequences — the traps — live in [`AGENTS.md`](../AGENTS.md).

---

## Foundations

## D1 — Scenes with per-transition paths
A timeline of scenes. Within a transition an arrow on a player defines the curve to their
next-scene position; players without one tween straight. Pure keyframes cannot express a curved
run, and a Gantt of paths makes "where is everyone at scene 3" unanswerable.

## D2 — Pure Canvas2D, no library
One `drawBoard(ctx, doc, t, view)`, no DOM or React, hand-rolled hit-testing. Konva and SVG were
both rejected: a scene graph between the code and the pixels is where preview/export divergence
comes from, and export has to drive the same function offscreen.

## D3 — Coordinates in pitch metres, never pixels
All document coordinates are metres on a 105 × 68 pitch. Pixels or normalised units put a
conversion wherever a distance matters and make export resolution a pervasive concern.

## D19 — Stack follows `wtc/ui`, with pnpm
React 19 + TS strict + Vite + Tailwind v4 + shadcn-style primitives, whose ESLint config and
`components/ui/` are directly reusable. Tests are Vitest on the engine only.

## D38 — English and Portuguese, and the engine speaks neither
Hand-rolled, one interpolation form and one plural rule; i18next would be more machinery than the
thing it manages. `en.ts` declares the keys and `pt.ts` is typed from it, so a missing key is a
compile error. Pure modules return a `Message` — a key and its variables — because none of their
callers agree on a language, and nothing is assembled from fragments: word order is not part of
the contract. A document never changes language with its reader; only a new one is seeded from
the active locale.

## D9 — Deferred: real player data, other formats
Custom players only. The blocker is licensing: Wikidata is the only clean bulk source, commercial
APIs forbid the caching an autocomplete needs, and photos carry redistribution risk. Eleven-a-side
only: the notation generator parses five and seven, but they need a player-count control and a
smaller pitch table.

---

## The board

## D11 — Formations come from notation, live on the team, and survive a change of shape
`fromNotation("4-2-3-1")` derives lines, depths, widths, numbers and seeded links; adding a
formation is adding a string. `Team.formation` is part of the document. "Reset board" starts
fresh keeping the two formations; "Reset positions" puts everyone on their marks in every scene
and keeps everything else.

**A formation change keeps the squad and drops that side's links.** Names and numbers carry
across; the new shape's seeded links are appended, so keeping the old ones would stack a stale
connector under the new one. Ownership is read from the OLD team, since a carried squad keeps its
ids. Slots pair by order, not id, because a renumbered player keeps his id.

## D13 — Teams can be hidden, and selection is derived
`Team.hidden` removes a side from drawing, hit-testing and selection, and takes its links with
it. Concealed players are filtered out at read time rather than cleared from the selection, so
unhiding restores what was selected.

## D18 — What the board looks like is authored
Things an export must reproduce live on the document, not the view:

- **Player size** — `tokenScale`, 0.5–2.5, scaling tokens, ball, carry offset, strokes and
  hit-test reach together. A board of eleven names needs smaller tokens than a board of six.
- **Grass** — `grass.shade` moves the green's lightness and never its hue, because every kit was
  chosen to read on green. `texture: "natural"` lays per-pixel noise over the stripes: shapes
  read as bricks or polka dots, and every texel is a hash of its position, never
  `Math.random()`. The textures are cached by the caller in `RenderView.turf` — a memo, not an
  input, so `drawBoard` stays pure — which takes a natural board from 13 ms a frame to 5.
- **Goals and ball** — the flat board draws the goal as seen from above (net, frame, posts) and
  the ball as a shaded sphere that turns with where it IS, not with time, so the export worker
  draws the same frame.

A board without these fields draws exactly as before.

## D37 — Kits: a colour, a pattern, a keeper, and only the palette
A kit is a colour plus an optional pattern — stripes and hoops separate two reds better than a
third red — screen-oriented like the shirt number. A team may carry a `keeper` kit, always plain
(patterns tell SIDES apart), worn by whoever `keeper.player` names or, unnamed, by the number 1.
The kit belongs to the side and the player is a pointer: moving or removing the keeper keeps the
colour for the next one. An automatic keeper colour avoids every shirt on the board and green.

**Every colour comes from `PALETTE`.** It is picked from one ball that opens the palette in a
popover (`ColorPicker`); a row's "none" state — no panel, a link's Auto, no highlight, the
team's own kit on the keeper — is the popover's first entry. There is no free colour input: kits
measured by the importer are snapped to the palette (redmean distance; two sides never on one
swatch) so that any colour can be picked again and a link matched to a kit exactly. Text colour
follows the kit's luminance.

## D14 — Timing: per-entity travel and waits, run styles, and flow
`Scene.travel` gives an entity its own duration against the scene's `transitionMs`, and
`Scene.delay` holds it at its start. The scene fits the latest `delay + travel`, not the longest
run, which removes the scenes that existed only to order two runs. `scenes[0].transitionMs` means
nothing — there is nothing to travel from.

**A run chooses how it starts and finishes** (`Scene.run`): gradual, sharp, or — at the finish —
runs on through the scene. Both-gradual is `easeInOutCubic` exactly, so every board ever drawn
moves as it did; every other combination is a cubic Hermite with a chosen slope at each end.
"Runs on" instead of an acceleration slider, because matching speeds across scenes by hand
always jolts: the runner arrives as the scene comes to rest, sets off at once, and crosses the
mark at the mean of the two paces. `runsThrough` is the only rule for whether it applies — a wait
on the next scene, the last scene, a standstill or flow mode turns it off. A runner on through a
scene moves during its hold, so a styled run is placed by TIME (`Resolved.ms`), not by `u`.

**Flow mode** (`BoardDoc.flow`) runs every transition at one pace with no holds, and linearly:
`easeInOutCubic` stops everyone dead at each boundary even with the holds removed. It ignores
`travel` and `delay`, and the scenes keep theirs for when it is turned off. Because its timings
derive from positions, any edit retimes the animation, so the editor re-pins the scrubber.

`Scene.hiddenRuns` hides a run's arrow per scene, per player (the ball included), never the
motion.

## D41 — An edit carries forward through the scenes nobody meant anything by
A drag or nudge applies its delta to every following scene the entity does not travel into.
Boards are laid out first and filled in after, so later scenes are usually still copies — and
moving a player in scene 2 only for him to snap back in scene 3 is the commonest complaint about
this kind of tool.

**Each scene is judged against the one before it, never against the edited one**, or the boundary
depends on a distance the edit itself is changing and a second nudge captures a scene the first
stopped at. The mode is fixed at the grab and is a visible control. What carries is a position;
attention does not (D100).

## D44 — The ball: a carrier, flags on its travel, and its own time
**A pass is a carrier change.** `scene.carrier` names who holds the ball and its position is
derived while carried; there is no pass object. A dribble is the ball glued to its carrier, so
anything deciding what the ball DID reads the carrier change (`ballTravelBetween`), never the
distance it covered.

**There is no ball until somebody is given it.** A scene has one when it names a carrier or
stores `ballPos`, never both, and a new board does neither — a ball parked on the centre spot is
a claim nobody made, and it snapped back there after every handover. `ballAt` returns null and
every reader checks. A ball's first appearance is on its holder and is not a travel.

**Giving the ball away carries forward**, through every following scene nothing happens to the
ball in, taking the same `Carry` a drag does. `"all"` reaches no further than `"stationary"`: a
handover has no delta, so carrying past a pass could only overwrite it.

**`shot` and `loft` are flags on the travel into a scene**, not shapes and not one enum: a chip at
goal is both, and the gates differ — `canShoot` needs a loose travel, `canLoft` only a travel.
`pruneBallFlags` drops either when the travel it describes stops existing (a carrier change, a
scene deleted or reordered). A lofted ball flies at constant speed — the turf is what slows a
ground pass, and with `easeOutQuad` left in it hangs beside the receiver and drops vertically —
and is drawn doubled at its apex on the flat board, lifted with a shadow in 3D. A shot is drawn
as doubled rails with a burst, the shaft stopping inside the head (`SHAFT_INTO_HEAD`).

**The ball keeps its own time, and a pass is met in stride.** "Released after" keeps it glued to
the passer as he runs; "pass takes" is its travel, shown as a speed. It arrives at the receiver
where he IS at that instant, sampled once in `passEnds` — shared with the pass line, so the arrow
points where the ball goes. With no timing of its own it leaves at once and arrives when the
baseline travel ends.

**It may go in the net.** `clampBall` lets a dragged ball behind the goal line between the posts,
to the goal's depth; players are still clamped to the pitch.

## D47 — Links are live connectors
A link is an ordered member list plus a style, recomputed every frame from the members'
interpolated positions — watching a midfield three stretch as it presses is the point, and a
static per-scene shape cannot deform. Member order is load-bearing: it is the chain and the
perimeter. Every link starts as a chain, because closing a shape is a deliberate act (right for a
midfield triangle, wrong for a front three), and a chain never closes, or a back four draws an
edge across the pitch.

`line` (solid, dotted) and `arrows` (none, forward, both) are fields beside the style rather than
more values of it. A head goes on every edge in member order and stops short of its token.
`animate` marches the dots off the render time, so it moves in playback and export and holds on
a paused board.

**A link has a scene range, optional at BOTH ends.** Scene ids, like an annotation's, so
reordering carries it. Absent means the open end, so a link written before ranges shows on every
scene — which is what it always did, and why no migration was owed. The rule is in `range.ts`
because links must not import annotations and `scenes.ts` would close a cycle.

## D20 — Drawings are scene-ranged, fixed geometry
Arrows, lines, zones, freehand, text and drawn balls in `BoardDoc.annotations`. Four load-bearing
choices: a scene range stored as **ids**, required at both ends, so reordering carries the
drawing and `deleteScene` prunes ranges rather than dropping shapes; **fixed geometry**, because a
drawing depends on nobody — a link is the opposite and they must not merge; **two layers**, zones
under the tokens and marks over them; **pitch metres**, so a drawing exports at any size.

- **Outlines.** `filled: false` draws a zone's edge alone, and absent is filled. An outline is
  grabbed by its edge, so a click inside reaches the players it frames.
- **Corners.** `polygon` stores its corners, dragged out regular and reshaped corner by corner;
  arrows and lines gain `via`. A line with corners is straight between them and drops its bend.
  A box becomes a polygon only on request.
- **A drawn ball is not the match ball.** A prop for a drill or set piece: an annotation drawn
  exactly like the ball and ignored by everything that reads the match ball. It stands up in 3D
  like a label. It proves the model takes props one small kind at a time; cones are still not
  asked for.
- A drawn arrow's shaft stops inside its head, as the ball's line does.

## D103 — Labels: a shipped face, measured widths, snapping and a ruler
A label is the one drawing not in pitch space: it stays upright while the board turns, which is
why the geometry functions take `rotated`.

**The face is Inter Bold, self-hosted as `PitchboardText`**, registered by `src/fonts.ts` in the
page before React mounts AND in the export worker. **Widths come from `glyphs.ts`**, the face's own
advances, and the renderer draws with `fontKerning = "none"`, so wrap, box, panel, handle and
hit test read one number and the engine stays pure. It is drawn at 100 px and scaled, because at
a few pixels Chrome hints advances ~18% wide. The box hugs the words: a greedy wrap at the widest
line's width reproduces the same lines, so grabbing the handle where it is drawn changes nothing.

**Placing** follows the player drag: each axis snaps on its own (⌘/Ctrl places freely) — the
label's edges or centre onto the pitch markings, other labels, and on a half view the middle of
the frame. `align` sets the lines left or right inside a box still centred on `at`. **The ruler**
shows while a drawing is moved on the flat board: it covers the crop, sits on the goal line in
view, shades the span the drawing covers and marks the frame's middle — the crop's middle in
metres, so no pixel enters the document.

## D100 — The spotlight: highlights, the darkness, and what stays out of it
**A highlight is `Scene.highlight`**, a record of id to colour — players, the ball, drawings and
links. It is per scene and **never carried forward**: a position is a fact that stands until
changed, attention is about one moment, and copying it forward says something the coach did not.

**The rest of the board goes dark** and each lit player stands in a pool of light. The darkness is
its own layer with the pools cut out (`destination-out`) so overlapping pools both stay lit; its
depth is `Scene.spotlight` (absent 55%), the same in the editor as in an export. It never pulses
(D6's palette). The halo is a billboard, drawn for every entity in one pass before any token.

**Highlight and darkness switch together at the START of the move into their scene.** Both read
`Resolved.to` and nothing else. Fading them on the positions' easing lit a long run only as it
ended, and a pool opening by `e` inside darkness deepening by `e` dimmed the lit player mid-move.

**A lit drawing or link keeps its place in the stack**: a glow in its colour just under it (soft
bands, not a canvas shadow, whose blur is in device pixels) and a hole cut to its shape — never
redrawn on top, or a lit zone covers the players in it. A key can outlive what it names, so
deletes prune through `withAnnotations`/`withLinks`, and the spotlight asks `lightsAnything`
rather than counting keys.

**Text is above the darkness always**; a note in the dark is a note nobody reads. **A drawing or
link can be `lit`** — kept out of the dark on every scene, with no glow. It is cut by its own
pixels, drawn into the darkness by the same functions that draw it (`drawKept`); a highlight's
band alone reads as a glow. Zones and filled links, drawn translucent, have their area cut clean
(`keptAreas`). `lit` never darkens a scene, and a highlight on the same thing wins.

## D12 — Framing is presentation, never document state
`PitchView` (half, rotation, tilt) lives in editor state, folded into one affine `Viewport`, so
the renderer applies one transform and everything downstream stays in metres. A half view is a
CLIP, not a re-centring. Tilt is applied at render time by `framingOf` and never written to
`rotated`, so the flat orientation survives a trip through 3D; it forces a vertical board. What
travels with a share link is D7.

---

## The editor

## D26 — Undo is a stack of snapshots, coalesced by gesture
`useHistory` keeps whole documents, capped at 60 — every engine function returns a new document
sharing what it did not touch, so an entry costs a pointer. A drag emits a document per
`pointermove`, so entries merge on a gesture key or one drag is forty steps.

## D93 — The editor's shape: play left, drawing right, and it explains itself
The left sidebar is the play — view, formations, selection, links; the right rail is the drawing
— tools and style on top, the list below. The rail opens when a tool is armed or a shape
selected; Formations fold while anything is selected. Both follow the rendered state, not each
handler that can change it. A shape's style rows appear in its card, or in a "next shape" card
for the armed tool, and nowhere with neither.

**Everything that deletes or replaces work goes through `notify`** and offers Undo from the
notice. The command palette (⌘/Ctrl+K) lists every action the panels offer.

**A tour, once.** Cards pointing at `data-tour` anchors (centred when the anchor is hidden), shown
on the first editor visit and on request. It stores the version seen, so a grown tour shows again.
It is told on its own board (`buildTourBoard`): the editor draws `tourBoard ?? savedDoc`, and
history, autosave and sync are bound to `savedDoc`, so the coach's board is never touched; view
state is held and restored, and undo is refused while it is up.

## D34 — The 3D view is a homography and two passes
`ctx.transform` is affine and a trapezoid is not, so the view warps a flat ground layer rather
than setting a matrix — nothing in `pitch.ts` had to learn about the camera. The **ground** takes
the perspective; **billboards** — tokens, ball, halos, text, drawn balls — stand up off it and
must be added to that pass explicitly. The goals are the only thing with height, depth-sorted by
being drawn at either end of the billboard pass. There is ONE camera, `cameraFor`, used by the
renderer and every hit test. A full pitch projects nearly square, and export follows the
projected aspect.

## D91 — Everything the flat board edits, the 3D view edits
Every pointer point is unprojected to pitch metres before anything reads it, so nothing drawn
under the camera is special once laid flat. `unproject` inverts exactly and returns NaN above the
horizon; one `onGrass` check covers every consumer, a drag holds and a release commits its last
good move. Hit-testing splits as drawing does: grass things through `unprojectPitch` and the flat
tests, standing things with `unbillboard` in the space they were drawn in — which is what answers
the grab-margin objection that once kept the view read-only. A label's handles live inside its
billboard. A marquee is a region of the pitch. The costs are accepted: precision up-pitch is
~1.5x coarser than across it, and a circle scribbled in 3D is an oval on the flat board.

---

## Storage, sharing and export

## D23 — Two JSON shapes, one importer
`share/json.ts` takes a whole `BoardDoc` or a short **setup** naming a formation and an XI, told
apart by `version`. A setup is built into a board and validated as one, so there is one
definition of renderable. Duplicate shirts a file states are rejected; ones we created are
resolved.

## D31 — Browser storage is untrusted, and never throws
`share/storage.ts` is the only place `localStorage` is touched. Every read validates and returns
null on failure. Stored data survives app versions and can be hand-edited, so it is discarded,
never repaired.

## D30 — A squad preset is one team, and there is one library
A preset is one side: formation, kit, the XI and that side's units, naming players by **shirt
number** — ids are minted per board. Signed out, the library is the browser's; signed in, it is
the account's, one D1 row per preset so two devices editing two squads never overwrite each
other. **Never both**: nothing is cached locally while signed in, and offline shows nothing,
because a second library is one nobody reads and everybody eventually has to merge. Adoption is
offered once per sign-in, deduped by name and shape, and clears the local copy only once every
preset landed. The body is stored opaquely and validated in the browser.

## D7 — Two ways to share: a frozen link, and an account's live one
**`#d=` links are immutable snapshots.** `#d=<base64url(deflate-raw(json))>`, decoded by the
page and never sent to a server, opened read-only with one way out: fork. Ten scenes with
a path on every player is ~3,300 characters; freehand is what blows the budget, and the dialog
says so. The crop rides beside the payload in `v=`, never inside `BoardDoc`, so no migration and
every older link still opens; rotation and 3D are the viewer's own. `origin` is left out. A hash
change does not reload, so the page listens for it.

**An account's published link follows the board.** Publishing mints a short `/share/<slug>`
pointing at the board row, and reloading it shows the board as it is now — a link to a board
you own should not need republishing after every edit. Withdrawing clears the slug; publishing
again mints a new one, so a withdrawn link stays dead. `GET /api/shares/:slug` is the only route
that answers without a session. The two mechanisms never meet.

## D39 — Accounts, projects, and mutable boards
A user signs in and owns projects; projects hold boards; a board is mutable. Users, projects,
boards and presets live in D1. KV is provisioned but nothing reads it. Sharing is D7.

**Projects nest** as one nullable self-reference — the tree is at most 25 rows and fetched whole.
Selecting a folder shows everything beneath it. Two guards live in the Worker, the only place that
sees the whole tree: no folder under its own descendant, and depth ≤ 5 measured as the new
parent's depth plus the height of the subtree carried. Every recursive walk is bounded
(`n < WALK_LIMIT`), because a CTE over a cycle does not terminate. Delete cascades through
subfolders and the confirmation counts them. `buildTree` files orphans at the root and breaks
cycles, because its rows come over the network.

## D6 — Export: mediabunny and gifenc, sized to the board
Video through mediabunny, GIF through gifenc, format chosen by capability check. `mp4-muxer` is
deprecated and `MediaRecorder` is realtime and drops frames. The worker renders with the same
`drawBoard`; cancelling is terminating it.

- **Size follows the board**, not 16:9: a preset sets the long edge, both axes round even for
  the encoder. An export may instead be `square` or `wide`, the board letterboxed on a vignetted
  surround.
- **The GIF palette is quantised once**, from sixteen sampled frames — antialiasing and
  translucent fills are most of the picture — or the greens crawl. Delays are differences of
  rounded cumulative times, or a 30 fps clip runs short.
- **A caption is view data** — a title and the scene name drawn by `drawBoard` in screen space,
  so preview cannot disagree with export. `transparent` leaves the surround unpainted for PNG;
  video has no alpha.

## D40 — Hosting: one Worker, OpenTofu for durable things, CI for the deploy
One Cloudflare Worker serves the SPA's assets and `/api/*`. Durable resources (D1, KV, R2) are
OpenTofu. The deploy is not: a Worker with static assets needs a completion JWT Cloudflare
expires after an hour, obtained by uploading `dist/` first, which Terraform can neither produce
nor hold — so `.github/workflows/deploy-worker.yml` deploys, from `main`, gated on lint,
typecheck, tests and build. The Cloudflare API token is made by hand: a stack that owns its own
credential can revoke its access mid-apply.

**It is served from a domain bought through Cloudflare Registrar** (wrangler's `routes`, with
`custom_domain`), because sending email needs one (D109); the zone's records are in the stack.
`workers.dev` stays on until the domain is proved. The GitHub Pages copy was retired with it:
it had no server, so no accounts, and one Worker is one thing to reason about.

## D108 — The operator's view: `/admin`, metadata only
One read-only page for the site's owner: totals, the accounts, and one account's projects, boards
and presets. **The gate is `ADMIN_EMAILS`**, a secret so the address stays out of the repository,
matched against the session's Google-verified email. Anything under `/api/admin/` answers **404**
to anyone else, signed in or not, so the surface cannot be found by probing. **Metadata only**:
counts, dates, sizes and scene counts, computed inside D1 so a document never enters the Worker.
Opening someone's board was left out on purpose: that is reading their work, not measuring use.
**`last_login_at` and `last_seen_at` are columns** (`0007`), because session rows die on sign-out
and expiry; `last_seen_at` rides the daily session slide, so it is accurate to a day. Anonymous
use — `#d=` links and boards never saved — does not reach the server and is not counted. The page
is English only and lazy-loaded.

## D109 — Email and password: the KDF runs in the browser, and no account is unverified
**The expensive half of hashing runs client-side.** Measured on the edge, PBKDF2-SHA256 costs
~0.27 ms of CPU per thousand iterations: 100k took 26–30 ms against a 10 ms free-tier budget
that is enforced loosely but not promised. So the browser derives a key with PBKDF2-SHA256 at
600k iterations (OWASP) over the password, **salted with `pitchboard:v1:` + the normalised
address** — Bitwarden's scheme, and it needs no endpoint that answers "does this address exist".
The Worker stores `v1$salt$SHA-256(salt$key)`: a leaked table still costs 600k iterations a
guess, and the key, not the stored value, is what logs in. Every constant in
`src/share/password.ts` is load-bearing; a frozen test vector guards them. Workers Paid and
moving to AWS were both weighed and rejected as cost for a problem the browser solves for free.

**Registering never creates an account.** The hash waits on a single-use `email_tokens` row and
the `users` row is written when the emailed link comes back, so every account's address has been
proved — which keeps `users.ts` joining a Google sign-in by email safe. Registering an address
that already has an account sets the password on it through the same link: that is how a Google
account gains one, and only the mailbox's owner can finish it. A password set by link ends every
other session. Links go to the page (`/?verify=`, `/?reset=`), which POSTs them, because mail
scanners follow GETs. Register and reset-request answer `ok` before any lookup or send
(`waitUntil`), and sign-in says only "wrong email or password", so nothing reveals whether an
address has an account.

**Abuse:** the routes that send mail take Turnstile; every auth route is rate limited per client
and per address (`AUTH_LIMIT`); bodies must be `application/json`, which a cross-site form cannot
send without a preflight — the login-CSRF guard. **Mail is Resend** from `noreply@<domain>`:
Cloudflare's Email Service sends to arbitrary recipients only on Workers Paid. Its DNS is in the
stack. Email needs a domain someone owns, so D9's "custom domain" deferral ended here (D40).

---

## The importer (`src/import/`)

A board from `tracks.json`, produced by the sibling `football-tracks`. Every rule here was
measured through `pnpm board` on the producer's clips and checked against the video; the numbers
are in git history. The standing rule over all of them: **an invented event is the most expensive
thing the importer can produce**, because it is drawn as football and reads as football.

## D73 — The importer never judges whether the football is any good
The coach chose the clip. Ranking passages by progression, final-third entries or shots decides
for them what is worth looking at. The importer may weigh whether it represents the clip — never
whether the football is interesting. A clip whose ball cannot be attributed stays ball-less.

## D52 — Measurement noise is not football
- **A speed across one frame is a position error times fps.** An impossible jump needs the step
  AND a three-sample baseline either side to agree; the step alone shattered a 48 fps clip into
  five times the fragments, and the board that came out validated, scored its best fidelity, and
  held no curved run. A good score on a short board is the symptom to distrust.
- **A track is not a player.** `splitImpossible` runs first and the tracker's id switches make
  splits frequent (56 tracks → 147 pieces); anything counting tracks is counting fragments. A
  side holds `MAX_PER_SIDE`.
- **A run shorter than the camera's error is not a run** (`STILL_M`). A third of all arrows were a
  standing player wobbling. Compare against where the player was last DRAWN, so a real slow drift
  accumulates.

## D81 — The board is the whole clip, and its roster is a cover
**The window is the whole clip.** `positionAt` HOLDS a player at his first or last sighting
outside his track, which is honest, so trimming the clip to where most of the roster is on screen
bought honesty the board already had and cost half the play. Every clip fields eleven a side; the
only bar is `MIN_OBSERVED_S`, whether a track is a player at all. The ends are trimmed only where
NOTHING was seen, and a ball event pins the window open only where somebody is visible at it.
`restartAt` still opens a board on a corner or kick-off it finds in the ball samples; free kicks
have no canonical spot and are out of reach.

**The roster is a greedy set cover, not a ranking.** On a clip that follows the ball, "seen
longest" means "wherever the camera settled", and ranking by it cut the players pressing a
goalkeeper. `bestCover` takes whoever adds most of the clip nobody chosen was seen in; it keeps
filling once the clip is covered, and coverage is a depth (1/(1+n)), not a flag, or the shape of
a press is lost. **The players the ball goes through are reserved** (`onTheBall`), like a
restart's taker, or the pass lands on grass.

**The limit is slots, not ranking.** A side can produce fifteen appearances for eleven places;
weighting by distance to the ball changed the order, not the set. The ways out are upstream
(joining fragments) or a board that can leave a player out of a scene.

**What the numbers mean.** `seen` and `dens` count drawn positions backed by a live sighting
(`witnessed`, never `coverage`, which measures a span and calls a two-second gap covered). They
fell when the board took the whole clip — read them with the roster: 11 v 11 at 48% beats 5 v 10
at 69%. Honesty, the roster and the ball cannot all be optimised; every ordering was measured and
each sacrifices the third. A fidelity rule never touches an event. Cutting a clip into several
boards was built and scrapped: a clip is one play.

## D71 — Who has the ball
- **The carrier is whoever KEEPS it** (`HOLD_S`, `HOLD_SHARE`), with the ball inside `SNAP_M` at
  least once. `z = 0` puts a lofted ball's shadow across every player it flies over, and speed
  cannot separate a fly-over from a reception — half of real receptions arrive above 9 m/s.
- **A one-touch pass is a change of direction** (`touchedAt`), with speed on both sides so noise
  cannot fake a right angle, and a touch needs the body (`SNAP_M`) — the post bends a ball too.
  Events get their own 0.2 s scene gap.
- **A turnover that gives the ball straight back never happened** (`steady`, across sides only).
  A change of side must be seen twice; a keeper in his box is exempt, since a catch is silent.
  A tackle the tackler does not come away from is not a turnover (`contested`).
- **A holder is judged against the field**: if somebody was nearer at every sighting of the hold
  (`takenFrom`), it is no longer his.
- **Carrying a holder forward reads the ball's silence, and expires** (`CARRY_S`), measured
  backwards only.
- **Anyone named must have been THERE.** `positionAt` clamps, so every rule that names a player —
  `nearestTo`, both backfills — checks he was inside his own track's span. The scenes before an
  unattributable flight are the kicker's only back to the last scene somebody was named at.
- **A track whose side nobody could read BLOCKS the ball**; stepping over it handed a keeper's
  pass to an opponent. `referee` is not a blocker.
- A pass two metres from a defender is what the camera model cannot resolve; it needs better
  evidence upstream, not another rule here. Ground truth for possession is itself a z = 0 reading,
  so a person watching the clip outranks the metric.

## D75 — The ball is evidence, not only a pointer at a player
- **The moment it comes loose is a scene** (`flights`), and a sighting far from the holder ends
  his possession (`leftBehind`). A flight with a player at both ends is one pass and holds the
  KICKER (`kickedBy`); only a shot, a ball out of play or a pass to an untracked player is drawn
  at the ball's own position.
- **Its silences are events** (`breaks`): both ends of a gap the ball moved across — the departure
  only where somebody still had it, or a pass in flight splits in two.
- **Behind the line between the posts is a GOAL** and stays in the net; elsewhere off the field
  it is a bad fit and dropped.
- **A loose ball is drawn at the nearest player's feet** within `SNAP_M`, without naming him —
  a metre and a half is the camera's error, and a pass into the gap reads as a pass into space.
- **A ball in the air is not where the board draws it** (`airborne`): its projection bows away
  from the near touchline by up to ten metres. Both tests are needed, the bow and `MAX_AIR_S`.

## D87 — A player nobody saw is drawn faded, in his own colours
`Scene.unseen` lists players with no sighting within `WITNESS_TOL_S` of the scene; they are drawn
at `UNSEEN_ALPHA`, filled (hollow is a ghost), with a dashed rim in the kit colour so the two
sides still read as sides. It is document, not view, so exports show it. Dragging a faded token
clears him for that scene. A hand-drawn board has no `unseen`.

## D88 — A board from video remembers what the importer said
The importer writes `origin`: per scene id the frame, carrier and positions it chose; per player
id the track, span, side and number. football-tracks' `ft learn` diffs a coach's exported board
against it and keeps his corrections as labels. Ids are the keys because they survive reordering;
anything the coach added has no entry. `switchSide` exists for this — it keeps a player's id. Left
out of share links; kept in JSON export, which is the hand-off.

---

## Merged and retired

| Old | Now | | Old | Now | | Old | Now |
|---|---|---|---|---|---|---|---|
| D4 | D44 | | D35 | D7 | | D76 | D75 |
| D5 | D47 | | D36 | D12 | | D77 | D37 |
| D8 | D40 | | D42 | D14 | | D78 | D71 |
| D10 | D9 | | D43 | D44 | | D79 | D75 |
| D15 | D12 | | D45 | D44 | | D80 | D81 |
| D16 | D40 | | D46 | D30 | | D82 | D81 |
| D21 | D47 | | D47 (highlights) | D100 | | D83 | D75 |
| D22 | D11 | | D48–D50 | D91 | | D84–D86 | D71 |
| D24 | D44 | | D51 | D39 | | D89 | D18 |
| D25 | D14 | | D53, D54 | D81 | | D90 | D37 |
| D27 | D14 | | D65 | D71 | | D92 | D87 |
| D28, D29 | D6 | | D66–D68 | D81 | | D94 | D6 |
| D32 | D11 | | D69 | D52 | | D95, D96 | D20 |
| D33 | D7 | | D70 | D81 (scrapped) | | D97, D98 | D44, D14 |
| | | | D72, D74 | D71 | | D99 | D47, D20 |
| | | | | | | D101 | D93 |
| | | | | | | D102, D104, D106 | D100 |
| | | | | | | D105 | D103 |
| | | | | | | D107 | D37 |

D17 became D19 early on; D55–D64 were never assigned.
