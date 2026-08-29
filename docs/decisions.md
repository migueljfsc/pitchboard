# Pitchboard — Decision Log

Why the design is what it is, and what was rejected. Each entry records the alternative not
taken, because that is the part that gets re-litigated later.

---

## D1 — Animation model: scenes with per-transition paths

**Decision.** A timeline of scenes. Within a transition, an arrow drawn on a player defines the
curve it travels to its next-scene position; players without an arrow tween in a straight line.

**Rejected — pure keyframes.** Straight-line tweens only, arrows purely decorative. Simplest to
build, but curved and overlapping runs are the entire point of a tactical diagram. A winger
cutting inside and an overlapping full-back are both straight lines in this model, which is
wrong.

**Rejected — pure path-based.** No scenes; every player gets a path with a start delay and
duration, and the timeline is a Gantt of overlapping animations. Maximum expressiveness, but
authoring is much harder and there is no cheap answer to "what does the shape look like at
t=3s" — which is exactly the question a tactics board exists to answer.

The hybrid keeps the scene as the unit of thought while allowing real curved movement between
scenes.

---

## D2 — Renderer: pure Canvas2D, no library

**Decision.** One `drawBoard(ctx, doc, t, view)` function, plain Canvas2D, no DOM or React
dependency. Hand-rolled hit-testing.

**Rejected — Konva / react-konva.** Built-in drag, events, and transform handles would save
roughly 350 lines of interaction code. But export means driving a second offscreen Stage, and
the scene graph sits between the code and the pixels — which is precisely where preview/export
divergence comes from. Trading a guarantee for a few hundred lines is a bad trade when the
guarantee is the product's core quality bar.

**Rejected — React-rendered SVG.** Best developer experience, native DOM events, crisp at any
zoom. But every export frame requires serialising SVG to an image and decoding it, which is slow
and fragile — fonts and CSS must be fully inlined, and it is the usual source of "the export
looks wrong".

With a pure function, export runs in a Web Worker on an `OffscreenCanvas`, faster than realtime,
and preview/export divergence is structurally impossible rather than a bug class to test for.

---

## D3 — Coordinates in pitch metres, never pixels

**Decision.** All document coordinates are metres on a 105 × 68 pitch.

**Rejected — pixels or normalised 0–1.** Both require a conversion wherever distances matter,
and both make export resolution a pervasive concern instead of a single scale factor.

Metres give resolution independence, one-line export scaling, and link distance metrics for
free. The cost is the discipline of never letting a pixel value into the document, which the
window-resize check in every phase's DoD is designed to catch.

---

## D4 — A pass is a carrier change

**Decision.** `scene.carrier` names the player holding the ball. The ball's position is derived,
not stored, while carried. Changing the carrier between scenes *is* a pass.

**Rejected — the ball as an ordinary entity** with its own positions and paths in every scene.
Simpler schema, but every carry becomes manual keyframing of the ball alongside the player, and
the two drift apart the moment the player's path is edited.

**Rejected — a separate pass object type** with source, target, and timing. More explicit, but it
duplicates the timing model already in the scene and adds a second thing to keep in sync.

The carrier field is one nullable string and covers carry, pass, loose ball, and collection. Two
details make it work: passes use `easeOutQuad` rather than the players' `easeInOutCubic`, and
pass endpoints are evaluated from interpolated positions so the ball leads a moving receiver.

---

## D5 — Links are live connectors, not decorations

**Decision.** A link is a first-class entity — an ordered member list plus a style — recomputed
every frame from members' interpolated positions.

**Rejected — static shapes drawn per scene.** Would make the connector a drawing that must be
redrawn each scene, and it would not deform during a transition. The entire value is watching
the shape distort while players move independently: the back 4 breaking as one defender steps
out, the midfield triangle stretching under a press.

Per-link style rather than a single global style, because a back 4 needs an open chain (a closing
edge across the pitch is obviously wrong) while a midfield 3 may want a closed triangle and a press
trap wants a translucent fill.

---

## D6 — Export: mediabunny, with GIF first-class

**Decision.** `mediabunny` for MP4 (H.264) and WebM (VP9); `gifenc` for GIF. Format chosen at
runtime by capability check, never user-agent sniffing.

**Rejected — `mp4-muxer` / `webm-muxer`.** The obvious choice, and deprecated. Both were
superseded by mediabunny, which covers muxing for both containers plus WebCodecs abstraction in
one zero-dependency tree-shakable package.

**Rejected — `MediaRecorder`.** Captures in realtime, which drops frames under load and ties
export duration to animation duration. Offline encoding is both faster and more reliable.

**Rejected — server-side render** (headless Chromium + ffmpeg). Perfect compatibility, but needs
an always-on container with CPU budget, which contradicts the free-tier constraint in the
portfolio's `CLAUDE.md`, and adds a job queue.

GIF is a first-class option rather than a fallback because it is the format that actually pastes
into a group chat. It requires a palette built once from the board's known colours — per-frame
quantisation makes the pitch greens shimmer.

---

## D7 — Immutable share snapshots, no accounts

**Decision.** Publishing mints a new id; opening a link gives you a fork. Three layers: local
autosave, self-contained `#d=` compressed URL, and KV for anything larger.

**Rejected — accounts with a saved-board library.** The better product, and a large scope
increase: auth, per-user storage, quotas, account deletion. Wrong shape for a portfolio piece.

**Rejected — local-only with file import/export.** Zero backend and zero abuse surface, but
nothing is shareable except a file, which kills the main use case.

**Rejected — mutable boards with edit keys.** Requires an authorisation model. Immutability
removes the question entirely, and matches what sharing a tactic means: you are sending a
position, not granting write access.

The `#d=` layer is worth the ~20 lines because `CompressionStream` is native: small boards then
work with no backend at all and survive the API being down.

---

## D8 — Cloudflare Worker + KV, OpenTofu-provisioned

**Decision.** A single Worker serves the static SPA and the `/api/boards` endpoints, with KV
holding board JSON. OpenTofu provisions the KV namespace; `wrangler` deploys the code.

**Rejected — GitHub Pages with URL-encoded state only.** Matches the two Astro projects exactly
and costs nothing, but URLs run long and complex animations exceed what chat apps and browsers
handle. Kept as the `#d=` layer rather than the whole answer.

**Rejected — GitHub Pages plus a separate Worker for links.** Splits one app across two hosts and
two pipelines, and adds CORS for no benefit.

**Rejected — container with a Go API,** reusing the `wtc` stack. Most consistent with the largest
project here and the strongest DevOps showcase, but it needs a paid always-on host.

**On the ownership split:** OpenTofu deliberately does not manage `cloudflare_workers_script`.
Terraform owning the script fights the Vite build for control of the artefact. Infra that
outlives a deploy belongs in OpenTofu; the deploy belongs to wrangler. The cost is one manual
step — pasting the KV namespace id into `wrangler.jsonc` after the first apply.

Free tier: 100k Worker requests/day, 100k KV reads/day, **1k KV writes/day**. Writes are the
binding constraint, so the rate-limiting binding goes on `POST`.

---

## D9 — Real player data deferred to v2

**Decision.** v1 ships custom players only. No real-squad autocomplete.

The original ask was a combobox of real players after three characters. The blocker is not
availability, it is licensing, and it is worth recording properly:

| Source | Problem |
|---|---|
| API-Football | 100 req/day free; terms restrict bulk caching and redistribution |
| football-data.org | 12 competitions free forever, 10 req/min, but squad data is a paid endpoint |
| TheSportsDB | Free tier is non-commercial only; artwork requires attribution and has mixed licensing |
| Sportmonks and similar | Paid from the start |
| **Wikidata** | **CC0, genuinely unrestricted.** `P106=Q937857` for footballers, `P54` for club. Freshness is patchy in lower leagues and transfer windows lag |

A per-keystroke autocomplete cannot call any of these directly — the free quotas die instantly
and the latency is poor. It requires seeding a local database and serving search from it, which
is exactly what the commercial terms forbid. Wikidata is the only source where that is clean.

**Player photos are a separate and harder problem** and are out of scope regardless of source:
redistribution rights rarely come with the data, and they would bloat the MP4 export.

Deferring keeps the whole data pipeline, seeding cron, and licensing question off the critical
path for a board that has to be good on its own first. When it returns: bulk SPARQL pull from
Wikidata into KV or D1, refreshed weekly, autocomplete served from our own store, tokens showing
number and surname only.

---

## D10 — Eleven-a-side only

**Decision.** The preset catalogue covers eleven-a-side football and nothing else.

**Rejected — five- and seven-a-side.** lineup-builder.co.uk offers both, and the notation
generator already parses their formations (`2-0-2` and friends parse correctly, zero lines
dropped). What it would additionally need is a player-count control and a smaller pitch — a
five-a-side board on a 105 x 68 pitch is nonsense. Deliberately out of scope: this is a
tactics board for the eleven-a-side game.

---

## D11 — Presets generated from notation, not hand-authored

**Decision.** `fromNotation("4-2-3-1")` derives lines, depths, widths, shirt numbers and
seeded links. Adding a formation means adding a string to `NOTATIONS`.

**Rejected — a hand-written table of 27 formations.** Every entry is an opportunity for a
transcription error, and the presets drift out of consistency with each other as they are
edited one at a time. Generation makes them uniform by construction and testable as a set —
the suite asserts shirt numbers stay within 1-11, lines stay symmetric, no two tokens overlap
across all 729 home/away pairings, and every formation matches its own notation.

The rule worth knowing: an interior line of three is compact in a 4-3-3 (central midfielders)
but wide in a 4-2-3-1 (wingers). What separates them is whether the line ahead already carries
the width.

---

## D12 — Framing is presentation, never document state

**Decision.** `PitchView { half, rotated }` lives in editor state, not in `BoardDoc`. Both
framings are plain affine maps folded into a single `Viewport`, so the renderer applies one
`ctx.transform(...)` and everything downstream works in metres exactly as before.

**Rejected — storing the view on the document.** Tempting, since a shared board would then
reopen the way its author framed it. But framing is a property of *looking*, not of the tactic:
two people can usefully view the same board differently, and baking it in would mean the export
resolution, the crop and the rotation all became document migrations later.

The test that keeps this honest compares command logs: rotating changes the transform matrix and
nothing else, apart from text. Every geometry call is byte-identical, so rotation cannot become
a second rendering path that drifts out of step.

**Text is the exception.** The rotated matrix carries a -90 degree turn, which stood every shirt
number on its side. `upright()` counter-rotates at each text anchor, leaving the local axes
aligned with the screen so labels position exactly as they do on a flat board.

**A half view only pays off rotated.** Half a pitch is 52.5 x 68 — taller than it is long — so on
a wide screen the height still constrains it and cropping just adds side margin. Rotated, it
fills the box at nearly twice the scale. The UI says so rather than leaving it puzzling.

---

## D13 — Teams can be hidden, and selection is derived

**Decision.** `Team.hidden` removes a side from drawing, hit-testing and marquee selection, and
takes its links with it. The editor derives a `visible` selection by filtering concealed players
out at read time.

**Rejected — clearing the selection when a team is hidden.** That needs a state sync in an
effect, which React rightly warns about, and it loses the selection permanently. Deriving means
a nudge can never move a token nobody can see, and unhiding the team gives the selection back.

---

## D14 — Per-entity travel time, with the scene sized to its slowest mover

**Decision.** `Scene.travel` maps an entity to its own travel time in milliseconds. The scene's
`transitionMs` is the baseline everyone uses; the window the scene actually occupies is the
longest of them. An entity that finishes early holds at its destination.

**Rejected — a normalised start/end window per player** (fractions of the scene transition).
Expresses "arrives early" and "sets off late" but cannot express "slower than the scene" without
making everyone else faster, which is backwards from how a coach thinks about it.

**Rejected — leaving the scene fixed and clipping a slow run.** A run cut off mid-stride is
never what was meant.

Letting the scene stretch keeps one number meaningful: the scene's Travel field is the default
for everybody, and the timeline total accounts for whoever needs longer. The UI states the
effective duration whenever an override is in play.

---

## D15 — A half view is a clip, and orientation stays independent

**Decision.** Choosing Left or Right clips the drawing to that half. Orientation is a separate
toggle that the crop never changes.

The original complaint was that a half view "shifted the field". It did, and the reason was not
the fit: the viewport put the half in the right place, but nothing clipped, so the other half
simply drew into whatever canvas width was left over. `drawBoard` now clips to the crop, and the
halfway line is a hard edge.

An earlier attempt coupled the two — picking a half turned the board vertical, because half a
pitch is 52.5 x 68 and only fills a wide board once turned. That was rejected on use: wanting to
study one half horizontally is a reasonable thing to want, and the tool should not overrule it.

The geometry still applies, and the panel says so: horizontally a half fits to the same height
as the full pitch, with space either side. **Player size** (D18) is the answer to wanting more
detail without turning the board.

---

## D16 — GitHub Pages

**Decision.** Deploy the SPA to GitHub Pages from `main`, gated on lint, typecheck, test and
build.

**Supersedes part of D8.** The Cloudflare Worker + KV design stands as the answer for
server-stored share links, but it is not needed to put the board in front of people, and Pages
matches how the other two static projects here deploy. The self-contained compressed-URL share
link works on a static host; KV only earns its place for boards too large for a URL.

`base` applies to production builds only, so `pnpm dev` stays at the root rather than moving to
`/pitchboard/`.

---

## D18 — Player size lives on the document

**Decision.** `BoardDoc.tokenScale`, 0.5 to 2.5, multiplying token and ball radius, the ball's
carry offset, stroke weights, shirt numbers and hit-test reach.

**Rejected — putting it in `PitchView` with the crop and rotation.** Framing is about looking
(D12), and two people can reasonably look at one board differently. Token size is not that: it
changes the artefact. An export has to reproduce it and a shared board should arrive looking as
its author left it, which makes it document state.

The risk this carries is drift between what is drawn and what is clickable. `tokenRadius` and
`ballRadius` in `pitch.ts` are the single source both sides read, never a call site multiplying
`TOKEN_RADIUS` by hand, and there are tests asserting a point outside a small token is inside a
large one.

**The default is `DEFAULT_TOKEN_SCALE`, 1.25, not 1.** A token at 1x is about a player's actual
footprint and too small to read a shirt number on at any sensible board size — accurate and
useless. The readable size is the default and 1x stays available for anyone who wants the
literal one. Absent means "whatever the default is", defined once in `pitch.ts`, so a document
that never set the field follows it rather than pinning an old value.

---

## D19 — Stack follows `wtc/ui`, with pnpm

**Decision.** React 19.2 + TS 5.6 strict + Vite 8 + Tailwind v4 + shadcn-style primitives,
matching `wtc/ui/`. pnpm rather than npm.

`wtc/ui` is the established React pattern in this portfolio and its ESLint config, Tailwind
setup, and `components/ui/` primitives are directly reusable. It uses npm, but the two Astro
projects and the portfolio default are pnpm, so pnpm wins on portfolio consistency.

**Vitest is new here.** There are currently zero JS/TS tests across the portfolio. The engine —
arc-length reparameterisation, timeline resolution, the ball carrier matrix — is pure numerical
code where tests are cheap and genuinely load-bearing. Component tests remain out of scope.

---

## D20 — Annotations: scene-ranged, static, and split across the stack

**Decision.** A drawing toolkit — arrows, lines, rectangular and oval zones, freehand and text —
stored as `BoardDoc.annotations`. Four choices inside it are load-bearing.

**Scene range, stored as ids.** Each shape carries `from` and `to` scene ids, `to: null` meaning
the end of the timeline. A zone can matter during the press and be gone once the ball is won,
which is most of why you would shade one. Ids rather than indices so reordering a scene carries
its drawing along; `deleteScene` prunes a dangling range back to the open end rather than
discarding the shape, because losing a drawing to a scene deletion is the worse trade.

*Rejected — one flat always-visible list.* Simpler, and unable to express the thing zones are
for. *Rejected — `scene.annotations`.* A shape wanted throughout would be duplicated per scene
and would multiply on every scene duplicate.

**Static within a scene.** Annotations appear and disappear at scene boundaries and hold still
in between. The players are already moving; a second thing in motion competes with them for the
eye. Draw-on arrows would need their own progress model and are a separate decision if ever
wanted.

**Zones under, marks over.** Shaded areas are background and are drawn before the links, or they
drown the play. Arrows, freehand and text are the coach talking over the top and are drawn above
the ball. Hit-testing walks the same split, so a zone loses a click to a player standing on it
and an arrow wins one.

**Visibility keys off the played scene, not the selected one.** `frame.resolved.index`, so
playback shows what the animation is at rather than what the editor has armed — the two part
company deliberately, since starting playback drops the editor back to scene 1. A transition
into scene *i* counts as scene *i*, matching where paths are stored.

`Annotation.color` is a plain colour, unlike `Link.color` (D-less, see `linkColor`): a drawing
belongs to whoever drew it, not to a team.

---

## D21 — Every link starts as a chain

**Decision.** `createLink` and the formation seeder both default to `chain`, whatever the size.
Closing a shape is a deliberate act, made in the link panel.

The original rule closed a three into a triangle automatically, on the grounds that a flat line
reads as a chain while a three is a shape worth closing. That is true of a midfield three and
false of most other threes — a front three, a back three pushed high, any three picked ad hoc
out of a selection. A closed shape draws an edge back across the unit, which is a claim about
how those players relate, and the tool should not be making it unprompted.

*Rejected — keep the size rule.* It is right often enough to feel clever and wrong often enough
to need undoing, which is the worst combination for a default.

---

## D22 — The formation lives on the team, and there are two resets

**Decision.** `Team.formation` is part of `BoardDoc`. "Reset board" starts a fresh board keeping
only the two formations; "Reset positions" puts every player back on their formation mark in
every scene, keeping names, numbers, links, drawings, the ball and the scene list.

The formation was editor state, which made both resets impossible to write honestly: the wide
one could only reach the hard-coded 4-3-3 against 4-4-2 whatever you had picked, and the narrow
one had nothing to reset *to*. It also meant an imported or shared board arrived not knowing its
own shape. Putting it in the document fixes all three, and costs one optional string.

**Slots are paired by ORDER, not by id.** `buildTeam` mints ids as `<team>-<number>`, but
renumbering a player keeps their id — so after any renumber the ids a fresh build produces no
longer match the squad. `resetPositions` walks `team.players` and the freshly built players
together by index. Players added by hand sit past the last slot and are left where they are.

**Positions reset clears the runs it flattens.** Every scene ends up holding the same shape, so
a curve between two identical points describes a journey of zero length — the same reasoning
`addSceneAfter` already used.

*Rejected — reset the current scene only.* Offered, and turned down: this is the general reset.
A per-scene version can come later.

---

## D23 — Two JSON shapes, one importer

**Decision.** `src/share/json.ts` accepts either a whole `BoardDoc` or a short **setup**
document, told apart by the presence of `version`. Both go through zod; a setup is built into a
board and then validated as one.

They answer different questions. A whole board is what you send someone so they open your play
exactly as you left it — every scene, run, link and drawing. A setup is what you would actually
sit down and type: a formation, eleven names and numbers, and the units you want linked. Making
one file format serve both would mean either a verbose thing nobody hand-writes or a lossy thing
that cannot carry a play.

Inside the setup form:

- **Players are listed in formation order, keeper first.** Matching by shirt number instead
  would require knowing which numbers the preset hands out before you can name anyone.
- **Link members ARE shirt numbers**, resolved after the squad exists — the only stable handle a
  human has on a player.
- **A side that lists links replaces its seeded ones; a side that says nothing keeps them.**
- **No `direction`.** teams[0] attacks +x throughout the renderer — the team names behind each
  goal, the ball's resting offset — so a file flipping it would break more than it buys.

Import replaces the whole board behind a confirmation. There is no autosave and no undo yet, so
it is the one destructive action a stray paste could trigger.

---

## D24 — A shot is a scene flag, not a shape

**Decision.** `Scene.shot` marks the ball's travel into that scene as a strike. The renderer
draws the ball's journey as a dashed line for a pass and a doubled solid line with a burst at
the contact point for a shot.

Players each got an arrow for their run and the ball got nothing, which left the one event a
tactic is usually about with no indicator at all. The line is drawn from `ballAt` sampled at
both ends of the travel, so it is the journey rather than an approximation of it — carrier glue,
`ballPath` and per-entity travel all included for free.

*Rejected — a "shot" annotation.* A drawing that happens to sit near the ball is not connected
to it: move the pass and the shot stays behind. This follows the same logic as D-ball — a pass
is a carrier change, not an object — so a shot is a property of that change.

*Rejected — a fourth `AnnotationDash`.* Same objection, plus it would let you draw a shot that
no ball takes.

**Only a loose travel can be a shot**, and `canShoot` is the one place that is decided — read by
both the toggle's enabled state and by `pruneShots`. A ball played to an OPPONENT stays a shot: a
keeper's save is the most common one there is. A ball reaching a TEAM-MATE is a pass by the
definition above, which is the one travel a strike cannot be.

**The flag does not outlive the travel it describes.** It began as a bug: releasing the ball,
marking the shot, then handing the ball back left `shot` set on a scene with nothing arriving —
the renderer drew no line, so the board looked right while the strip still said "shot" and the
toggle sat lit but disabled, and releasing the ball again silently restored a strike nobody asked
for. The cause was two rules for one question: the toggle was gated on the ball travelling, and
nothing at all guarded the stored flag.

Enforcing it at the edited scene alone would not have been enough. Setting a carrier changes the
travel into **that** scene and into the one after it, and deleting or reordering a scene changes
it for a neighbour. `pruneShots` therefore runs in `replace`, the one point every scene mutation
passes through, and again in `applyFormation`, which nulls carriers of its own accord.

**What gets a line, and which one, comes from the carrier change** — `ballTravelBetween`, not
from how far the ball moved. A carrier running with it drags it the length of their run, so
distance drew every dribble as a pass. Same carrier throughout is a dribble and gets no line at
all; the run arrow already says it. Dashed is reserved for a change of hands between team-mates,
which is what the convention means. A turnover, a release or a ball collected off the floor is
drawn solid — it travelled, but calling it a pass would be a claim about the play that is not
true.

---

## D25 — Run arrows hide per scene, per player

**Decision.** `Scene.hiddenRuns` lists entities whose arrow is not drawn for the travel into
that scene. Movement is unaffected — this hides the indicator, not the motion. `BALL_ID` is a
valid entry and suppresses the pass or shot line.

A scene where ten players shuffle two metres and one makes the run that matters is unreadable
with eleven arrows on it. Per scene because a run worth explaining in one scene is clutter in
the next; per player because which one matters changes scene by scene.

*Rejected — a global "show arrows" toggle.* Correct nowhere: you either lose the arrow you
wanted or keep the ten you did not.

---

## D26 — Undo is a stack of snapshots, coalesced by gesture

**Decision.** `useHistory` in `src/lib/history.ts` keeps whole `BoardDoc` snapshots, past and
future, capped at 60. Undo/redo sit in the sidebar header and on ⌘/Ctrl+Z and ⌘⇧Z / Ctrl+Y.

**Snapshots, not inverse operations.** Every function in `src/board/` already returns a new
document sharing everything it did not touch, so an entry costs a pointer, not a copy. The
alternative — an undo implementation per operation — is a second thing to keep in step with the
operations themselves, and it goes wrong silently.

**Coalescing is the whole problem.** A drag emits a document per `pointermove`; stepping back
through those one at a time is not undo, it is rewind. So `set(next, merge?)` takes an optional
key, and consecutive changes sharing one replace the top of the stack instead of pushing onto
it. `BoardCanvas` bumps a gesture counter on every `pointerdown` and tags that drag's writes with
it; text fields pass a key per field, so a typed name is one step. A change with no key always
pushes, and an undefined key never merges with another undefined one.

*Rejected — coalescing on a timer.* It merges two deliberate quick clicks and splits one slow
drag, and it makes what undo does depend on how fast you were moving.

**The document only.** Not the selection, the framing, the armed tool or the open panels. Those
are how you are looking at the board, not changes to it, and rewinding them is its own surprise.
Undo can shorten the scene list under the selected scene, so the selected index is clamped where
it is read rather than synced back into state.

**Reset and import are undoable**, like anything else. An accidental reset is exactly when undo
earns its keep.

The stack maths is pure and lives outside the hook, because this project tests the engine and
not components.

---

## D27 — Seamless flow is a pace, and linear

**Decision.** `BoardDoc.flow` — `{ speed, endHoldMs }`, present meaning on. Every transition runs
at `speed` metres per second, nothing holds between scenes, only the last frame is held, and
movement is linear.

**Zero holds is not seamless.** The obvious implementation — set every `holdMs` to 0 — does not
work, and the reason is the easing. `easeInOutCubic` starts *and ends* at zero velocity, so with
the holds gone every player still decelerates to a dead stop at each scene boundary and sets off
again. That pulse is most of what reads as a cut between scenes. Flow mode is therefore linear:
constant velocity through the seam is the whole point.

**A pace per scene, not one for the board.** `Scene.speed` overrides `flow.speed` for the travel
INTO that scene, and a scene added after another inherits its pace — you set 20 m/s once and keep
working, rather than resetting it on every scene you add. Absent means the board's pace, so a
document written before per-scene pacing reads exactly as it did. `scenePace(doc, index)` is the
one place the fallback is resolved, so the timeline and the field showing the number cannot
disagree. Scene 0 takes no pace: nothing travels into it, and the panel hides the field there the
same way it hides Travel.

**A pace, not a duration.** Each transition takes as long as its longest move
needs. A scene where the shape shuffles two metres takes two metres' worth of time rather than a
full beat, which is what makes the result read as one movement instead of a sequence.

*Rejected — one step duration for every scene.* Simplest knob, and it makes a 2 m adjustment
last exactly as long as a 40 m sprint. *Rejected — a total clip length.* The same maths with the
knob at the other end; worth revisiting if the export ever wants a target duration.

A consequence worth knowing: the window belongs to the scene's *longest* mover, so everyone else
covers a shorter run inside it and is correspondingly slower. The alternative is players
arriving early and standing still, which is the stutter being removed.

**Nothing is overwritten.** `transitionMs`, `holdMs` and the per-entity `travel` overrides stay
exactly as they were and are simply not read; per-entity overrides are ignored outright, since a
board-wide pace with one player keeping their own time is one player breaking step. Turning flow
off gives back the timing that was tuned, to the millisecond.

**One timing table.** `sceneTimings(doc)` returns what each scene is actually worth, and
duration, scrubbing and scene starts all read it. The mode is decided in one function rather
than branched in four, which is what keeps the scrubber, the strip and the playhead agreeing.
The pace uses straight-line distance rather than arc length — it is called every frame, and a
curved run coming out a few per cent quick is invisible next to building an arc table per entity
per scene.

**The ball keeps its own easing.** A struck ball really does decelerate, and that is its motion
rather than a seam between scenes.

The price of deriving timings from content: an edit retimes the animation, and the scrubber
holds an absolute time. The editor re-pins it to the selected scene on every change, or the
board ends up rendering a frame mid-transition — interpolated positions, which do not follow a
drag — while the edit lands on the scene the panel says is selected.

---

## D28 — Export size follows the board, not a broadcast aspect

**Decision.** A resolution preset sets the **long edge**; the short edge derives from the board's
own aspect — the visible span along the pitch plus `PITCH_PADDING` on every side, swapped when the
board is rotated. `exportSize()` is the one place it happens, and it rounds both axes even because
H.264 and VP9 both want that.

The full upright board is about 1.46:1, a rotated one is taller than wide, and a half view is
nearly square. A fixed 16:9 would serve exactly one of those three. It is also the framing the
editor already uses: `fitViewport` fits the same content box, so an export at this aspect touches
all four margins and there is no dead space to letterbox.

*Rejected — fixed 720p/1080p/1440p.* Standard sizes, and a vertical board exports as a strip of
pitch between two wide bands of surround. The board is the subject; the surround is not.

*Rejected — matching the editor canvas.* It is a window size. Export output must not depend on how
wide someone happens to have dragged their browser, which is the same reason `drawBoard` is pure.

The consequence is that dimensions vary with framing — a 1920 export is 1920×1318 upright and
1178×1920 rotated. The dialog states the size before you commit, taken from the same `exportSize`
the worker uses, so it is a statement rather than an estimate.

---

## D29 — The GIF palette is quantised once, over sampled frames

**Decision.** Sample sixteen evenly spaced frames, subsample their pixels to a fixed budget,
quantise **once** to 256 colours, then map every frame through that one palette.

The rule that matters is one palette for the whole animation, and it is not about file size: a
palette rebuilt per frame makes the pitch greens crawl between frames, and that shimmer reads far
worse than any colour loss it avoids. The encoder writes one global colour table and no local
tables — which is a thing a test can actually assert about the bytes.

*Rejected — a fixed palette built from the board's named colours* (pitch, lines, both kits, ball,
links), which is what `architecture.md` originally specified. It is the smallest and most literal
reading of "quantise once", and it ignores that the renderer antialiases every token edge and
pitch line and that a `filled` link is translucent over grass. Those blends are most of the
picture; snapping them to the nearest kit colour bands the fills and serrates the tokens.

Sampling has to see the whole clip — first and last frame included — or a kit colour that only
appears in the final scene is missing from the palette. It also has to see thin features, so the
pixel stride is forced odd: a stride dividing the row width walks the same columns on every row
and misses the vertical markings entirely.

---

## D30 — A preset is a squad, not a board

**Decision.** A saved preset holds **one team**: formation, kit, the XI with their numbers and
names, and that side's units. It applies to Home or Away independently, leaving the opponent, the
scenes, the drawings and the timings untouched.

The thing worth not retyping is an eleven. A coach sets their own side up once and plays it
against a different opponent every week, so a preset that dragged last week's opponent along with
it would be reusable exactly never.

**It reuses `setupTeamSchema`** rather than declaring a shape of its own — a preset *is* a setup
team with a label on it. One validator, so the stored form and the hand-written `.json` setup file
cannot drift, and `teamToSetup` / `resolveTeamLinks` serve both.

**Applying goes through `applyFormation`**, which already rebuilds one team in place and leaves
the other alone. That means positions for that side go back to their formation marks in every
scene — unavoidable, since changing the shape is repositioning. There is no confirmation, because
it is an ordinary document edit and undo already covers it.

*Rejected — whole-board presets.* Free, since the setup shape already describes both sides, and it
answers the wrong question. Still reachable through the existing `.json` export.

*Rejected — storing positions.* That is a board, and boards are what `.json` export and share
links are for. A preset that carried positions would fight whatever scene it landed on.

Members are shirt numbers, not ids: ids are minted per board, and renumbering a player keeps
theirs, so a number is the only stable way for a stored file to name a player.

**A preset is identified by its name AND its shape.** Saving over the same name in the same
formation replaces that preset in place, keeping its id and its position in the list, behind a
confirmation. The same name in a DIFFERENT formation is a separate preset — "Arsenal" as a 4-3-3
and "Arsenal" as a 3-5-2 are two setups a coach switches between, not one saved twice, which is
why the picker shows the formation beside the name. Names match trimmed and case-insensitively,
so re-saving under what reads as the same name replaces rather than leaving a near-duplicate
differing by a capital.

That confirmation is one of the few in the app that really is final: presets live outside the
document, so nothing about them reaches the undo stack.

---

## D31 — Browser storage is untrusted, and never throws

**Decision.** `share/storage.ts` is the only place `localStorage` is touched. Every read takes a
parser and returns null on failure; every write returns a boolean; nothing anywhere throws.

**Touching `localStorage` is not safe.** Safari's private mode throws on write, a browser set to
block site data throws on read, and some embedded contexts throw on the property access itself.
The store is therefore resolved per call rather than once at module load — a module-level failure
would take the whole bundle down with it. A tactics board losing an autosave is a shrug; one that
will not open because it could not read one is not.

**Everything read back is untrusted input.** It has sat in a browser across app versions and can
be edited by hand in devtools. A restored board goes through `boardDocSchema` and a preset library
through its own schema, and anything that fails is discarded rather than repaired — a
half-understood preset reaching `applyFormation` is worse than no preset.

The cost is that presets live in one browser: they do not follow anyone to another device, and
clearing site data takes them. That is the price of D7's no-accounts position, and the `.json`
export is the escape hatch.

---

## D32 — A formation change keeps the squad and drops the units

**Decision.** Changing a side's formation carries its **names and numbers** across and discards
its **links**, replacing them with the ones the new shape seeds. `changeFormation` names that
intent; `applyFormation` stays mechanical underneath it so a preset can still bring a squad of its
own.

A squad and a shape are different things. The eleven is the coach's work — typed once, and the
reason presets were asked for in the first place; the shape is only where they stand this week.
Wiping the names on a formation change made trying a shape cost the same as building a board.

Units go the other way. A back four's chain says nothing about a back three: the members are
different players in different roles, and the name on it is now a lie. Worse, the seeded links are
appended, so keeping the old ones stacked a stale connector under the new one and a few changes
left eleven overlapping links on one side. Ownership is read from the **old** team, because a
squad carried across keeps its ids and the stale links would otherwise survive the prune.

**Slots pair by order**, which is what `buildTeam` already expects. A squad deeper than the new
shape loses its tail; a shallower one takes the new shape's own numbers for the slots it does not
reach. Roles do not follow: slot four of a back four becomes a midfielder in a back three, so a
right-back's name can land on someone further forward. That is inherent to order-pairing, and the
alternative — inferring roles across 27 formations — is a guess dressed as a feature.

**A carried squad can collide with the new shape's numbers.** Ids are `<team>-<number>`, so two
players on one shirt share an id and the second silently overwrites the first in every scene's
positions. `buildTeam` now moves the loser to the lowest free shirt. A formation's own numbers
never collide; this only bites when a squad is shallower than the shape it is moving into.

That repair created a second question, since the setup importer *rejects* duplicate numbers rather
than fixing them. Both are right, on a rule worth stating: **reject what was written wrong, resolve
what was left to us.** A file naming two number 7s is an error worth reporting; a collision between
a number a person chose and one the app picked is the app's to sort out. The importer therefore
checks the numbers in the *file*, not the numbers that came out of the build.

---

## D33 — The share link carries the board, and opens it read-only

**Decision.** `#d=<base64url(deflate-raw(json))>`, decoded by the page itself. A link opens in a
read-only viewer with one way out: fork, which takes a local copy and clears the hash.

**Measured before it was designed.** The plan's stated worst case — ten scenes with a path on
every player — compresses to **3,282 characters**; a default board to 998. Freehand is the only
thing that breaks that: ten strokes at the 400-point cap reach 28,000 characters and thirty reach
77,000. So the link covers every board that is not drowning in drawing, which is what D16
predicted and now has a number behind it.

The budget is 8,000 characters, and it is not a browser limit — Chrome and Safari both carry far
more. It is the chat clients, mail gateways and issue trackers in between, which truncate
silently. A cut link is worse than a rejected one, because it fails at the recipient's end as a
damaged board rather than at the sender's end as an error. Over budget, the panel says so and
offers the JSON export instead, with "copy it anyway" for anyone who knows where it is going.

**A read-only viewer, not the editor.** D7 makes a published snapshot immutable, and this makes
that legible: a recipient is shown a tactic rather than handed an editor that happens to contain
one. The canvas takes no pointer events and draws with the same `interactive: false` the exporter
passes, so a shared board looks exactly like an exported frame. Framing stays available because
framing belongs to whoever is looking (D12); player size does not, because it is document state
(D18).

*Rejected — opening straight into the editor.* Cheaper, and it makes every share look like an
invitation to edit something that cannot be edited.

**No router.** The app is one page and a share link is a fragment, which is also what lets it work
on a static host with no rewrite rules. The hash is watched rather than read once: pasting a link
into a tab that already has Pitchboard open changes the fragment WITHOUT reloading, and a
one-shot read at mount leaves the recipient looking at their own board wondering what the link
did.

**The clipboard is allowed to refuse.** `writeText` throws whenever the document is not focused,
which is routine rather than exceptional. Reporting that and stopping leaves the link unreachable,
so the fallback shows it in a selectable field instead.

---

## Invariants

Two rules a future change is most likely to break. Both belong in `AGENTS.md`.

1. **`drawBoard` is pure.** No DOM, no React, no `Date.now()`, no `Math.random()`. If a value is
   needed, it goes in `BoardDoc` or `Viewport`. Breaking this breaks export fidelity, and the
   symptom appears far from the cause.
2. **No pixels in the document.** All coordinates are pitch metres. Breaking this shows up as
   players drifting on window resize or on a retina display.
