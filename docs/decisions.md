# Pitchboard — Decision Log

Why the design is what it is. Settled choices are one or two lines — enough to recognise the
decision and not reopen it. The ones that still shape day-to-day work carry their reasoning.
Operational consequences live in [`AGENTS.md`](../AGENTS.md); numbering is stable, because the
code cites it.

---

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

## D4 — A pass is a carrier change
`scene.carrier` names who holds the ball, and the ball's position is derived while carried.
Changing the carrier between scenes *is* a pass — there is no pass object. A ball with its own
positions in every scene would make each carry manual keyframing alongside the player.

## D5 — Links are live connectors
A link is an ordered member list plus a style, recomputed every frame from members' interpolated
positions. Static per-scene shapes would not deform during a transition, which is the whole
value: watching a midfield three stretch as it presses.

## D6 — mediabunny for video, gifenc for GIF
Format chosen by capability check, never user-agent sniffing. `mp4-muxer`/`webm-muxer` are
deprecated in favour of mediabunny; `MediaRecorder` is realtime and drops frames.

## D7 — Share links are immutable snapshots
Opening a link gives you a fork, never an edit. No edit keys, no authorisation model. Partly
superseded by D39, which adds accounts and mutable saved boards alongside it.

## D8 — One Cloudflare Worker serves the SPA and the API
Static assets and `/api/*` from the same Worker, with durable resources in OpenTofu. See D40 for
why the deploy itself is not in the stack.

## D9 — Real player data deferred
v1 ships custom players only. The blocker is licensing, not availability: Wikidata (CC0) is the
only clean bulk source, every commercial API forbids the bulk caching a fast autocomplete needs,
and player photos carry redistribution risk whatever the source.

## D10 — Eleven-a-side only
The notation generator already parses five- and seven-a-side, but they need a player-count
control and a smaller pitch, and the pitch table is written for full dimensions.

## D11 — Presets generated from notation
`fromNotation("4-2-3-1")` derives lines, depths, widths, numbers and seeded links. Adding a
formation is adding a string to `NOTATIONS`. A hand-written table of 27 drifts.

## D12 — Framing is presentation, never document state
`PitchView` lives in editor state. Both framings are affine maps folded into one `Viewport`, so
the renderer applies a single transform and everything downstream stays in metres. Refined by
D35: the crop travels with a share link, the rest does not.

## D13 — Teams can be hidden, and selection is derived
`Team.hidden` removes a side from drawing, hit-testing and selection, and takes its links with
it. The editor filters concealed players out at read time rather than clearing the selection, so
unhiding restores what was selected.

## D14 — Per-entity travel time
`Scene.travel` gives an entity its own duration; `transitionMs` is the baseline. The scene
occupies the longest of them, and an entity that finishes early holds at its destination.
Extended by D42.

## D15 — A half view is a clip
Left or Right clips the drawing to that half rather than merely re-centring it. Orientation is a
separate toggle the crop never changes.

## D16 — Deployed from `main`, gated on the full check suite
Lint, typecheck, test and build all pass before anything ships.

## D18 — Player size lives on the document
`BoardDoc.tokenScale`, 0.5–2.5, scaling tokens, ball, carry offset, strokes and hit-test reach
together. It is authorship, not framing (D12): a board of eleven names needs smaller tokens than
a board of six, and that is true for everyone who opens it.

## D19 — Stack follows `wtc/ui`, with pnpm
React 19 + TS strict + Vite + Tailwind v4 + shadcn-style primitives. Its ESLint config and
`components/ui/` primitives are directly reusable.

## D20 — Annotations are scene-ranged, static geometry
Arrows, lines, zones, freehand and text in `BoardDoc.annotations`. Four load-bearing choices:
a scene range stored as **ids**, so reordering scenes carries the drawing; **fixed geometry**,
because an annotation depends on nobody (a link is the opposite and they must not merge);
**two layers**, zones under the tokens and marks over them, with document order deciding ties
inside a layer; and **pitch metres**, like everything else, so a drawing exports at any size.

## D21 — Every link starts as a chain
Closing a shape is a deliberate act. Auto-closing a three is right for a midfield triangle and
wrong for a front three, and a chain is one click from a polygon either way.

## D22 — The formation lives on the team, and there are two resets
`Team.formation` is part of the document. "Reset board" starts fresh keeping only the two
formations; "Reset positions" puts everyone back on their marks in every scene, keeping names,
numbers, links, drawings, the ball and the scene list.

## D23 — Two JSON shapes, one importer
`share/json.ts` takes either a whole `BoardDoc` or a short **setup** naming a formation and an
XI, told apart by the presence of `version`. A setup is built into a board and then validated as
one, so there is a single definition of what is renderable.

## D24 — A shot is a scene flag
`Scene.shot` marks the ball's travel into that scene as a strike, drawn as doubled rails with a
burst rather than a dashed pass line. `canShoot` is the only rule for whether one is possible —
gate and flag disagreeing is what let a stale flag survive.

## D25 — Run arrows hide per scene, per player
`Scene.hiddenRuns` suppresses the indicator, never the motion. `BALL_ID` is a valid entry.

## D26 — Undo is a stack of snapshots, coalesced by gesture
`useHistory` keeps whole documents, capped at 60 — every engine function already returns a new
document sharing what it did not touch, so an entry costs a pointer. A drag emits a document per
`pointermove`, so entries merge on a gesture key or one drag becomes forty undo steps.

## D27 — Seamless flow is a pace, and linear
`BoardDoc.flow` runs every transition at a fixed metres per second with no holds between scenes.
Linear, deliberately: `easeInOutCubic` starts and ends at zero velocity, so simply removing the
holds still stops everyone dead at each boundary.

## D28 — Export size follows the board
A resolution preset sets the long edge; the short edge comes from the board's own aspect, not
16:9. Both axes round even, because H.264 and VP9 require it.

## D29 — The GIF palette is quantised once
Sample sixteen frames, quantise once to 256 colours, map every frame through that palette. A
palette rebuilt per frame makes the pitch greens crawl. It is sampled from frames rather than the
board's named colours because antialiased edges and translucent fills are most of the picture.

## D30 — A preset is a squad, not a board
One team: formation, kit, the XI with numbers and names, and that side's units. It names players
by **shirt number**, never by id — ids are minted per board and a renumbered player keeps theirs.

## D31 — Browser storage is untrusted, and never throws
`share/storage.ts` is the only place `localStorage` is touched. Every read validates and returns
null on failure; nothing throws. Stored data survives app versions and can be hand-edited in
devtools, so it is discarded on failure rather than repaired.

## D32 — A formation change keeps the squad and drops the units
Names and numbers carry across; links are replaced by the ones the new shape seeds. Seeded links
are appended, so keeping the old ones stacks a stale connector under the new one. Ownership is
read from the OLD team, since a carried squad keeps its ids.

## D33 — The share link carries the board, and opens it read-only
`#d=<base64url(deflate-raw(json))>`, decoded by the page itself, with one way out: fork. Ten
scenes with a path on every player compress to about 3,300 characters, well inside what chat
apps carry; freehand is the only thing that blows the budget, and the dialog says so.

## D34 — The 3D view is a homography and two passes
`ctx.transform` is affine and a trapezoid is not, so the view warps a flat ground layer instead
of setting a matrix — which is why nothing in `pitch.ts` had to learn about the camera. Two
passes: the **ground**, which takes the perspective, and the **billboards** — tokens, ball, text
— which stand up off it. Anything new that must stay upright has to join the billboard pass
explicitly. The goals are the only thing with height, depth-sorted by being drawn at either end
of that pass.

## D35 — The crop travels with the link
The crop is part of what was being shown, so it rides beside the payload in `v=`, never inside
`BoardDoc` — no migration, and every link published before it still opens. Rotation and 3D stay
the viewer's own.

## D36 — Tilt is rendered, not written
The toggle never writes `PitchView.rotated`; `framingOf` applies it at render time, so the flat
orientation survives a trip through 3D instead of being silently overwritten.

## D37 — A kit is a colour and a pattern
Stripes and hoops separate two reds better than a third red would, at one optional field.
Screen-oriented like the shirt number: "vertical" means vertical in the frame.

## D38 — English and Portuguese, and the engine speaks neither
Hand-rolled, ~260 strings, one interpolation form and one plural rule; i18next would be more
machinery than the thing it manages. `en.ts` declares the keys and `pt.ts` is typed from it, so a
missing key is a compile error. Pure modules return a `Message` — a key and its variables —
because none of their callers agree on a language, and nothing is ever assembled from fragments:
word order is not part of the contract.

## D39 — Accounts, projects, and mutable boards
A user signs in and owns projects; a project holds boards; a board is mutable. Users, projects
and boards live in D1, published snapshots in KV. Supersedes D7's "no accounts" and keeps the
rest: a published link is still an immutable copy.

## D40 — OpenTofu does not own the credential it authenticates with
The Cloudflare API token is created by hand; the stack only documents its scopes. A stack that
owns its own credential can revoke its own access mid-apply and cannot be re-planned afterwards.
The Worker deploy is out for a related reason: it needs a completion JWT Cloudflare expires after
an hour, obtained by hashing and uploading `dist/` first, which Terraform can neither produce nor
hold in state. CI deploys it instead.

## D41 — An edit carries forward through the scenes nobody meant anything by
A drag or a nudge applies its delta to every following scene the entity does not travel into.
Boards are built by laying out scenes and then deciding what happens in them, so the later scenes
are usually still a copy of the one being edited — and moving a player in scene 2 only to find
them snap back in scene 3 is the commonest complaint about this kind of tool.

**Each scene is judged against the one before it, never against the scene being edited.**
Otherwise the boundary depends on a distance the edit is itself changing, and a second nudge in
the same direction captures a scene the first stopped at. The mode is fixed at the grab rather
than read per `pointermove`, and it is a visible control: an edit that reaches further than you
expected is worse than one that reaches less far.

## D42 — A wait is per entity, and the scene fits the last arrival
`Scene.delay` holds an entity at its start; `Scene.travel` changes how long its run takes. The
window fits the latest `delay + travel`, not the longest single run. What it removes is scene
count: "the winger goes, then the full-back overlaps" was two scenes, the second existing only to
order the first. Flow mode ignores both, because everyone keeps step (D27).

## D43 — Giving the ball away carries forward, like a move does
`setCarrier` takes the same `Carry` a drag does, and reaches through every following scene
nothing happens to the ball in. The same holder, or a loose ball nobody moved, is nothing
happening; a different holder is a pass and a ball put down elsewhere is a pass into space, and
both stop the carry.

`"all"` reaches no further than `"stationary"` here. A handover has no delta to translate the way
a position does, so carrying past a pass could only overwrite it — better a mode that means less
than one that quietly destroys a sequence.

## D44 — There is no ball until somebody is given it
A scene has a ball when it names a carrier or stores a position, and a new board does neither.
`ballAt` returns `null` for a scene with no ball, and the schema's rule is only that a scene never
holds both.

A ball parked on the centre spot is a claim the author never made. It sat in every scene of every
new board, drew itself into every export, and turned "give the ball to the striker in scene 3"
into a ball that visibly snapped back to the halfway line in scene 4 — which is what D43 answers,
and this is the other half of it. A ball that appears for the first time appears on its new
holder rather than flying in from the centre, and arriving is not a travel: it cannot be a shot.

## D45 — A lofted ball is a scene flag, drawn twice
`Scene.loft` marks the ball's travel into a scene as leaving the ground — a cross, a
chip, a clipped diagonal. A flag on the travel rather than a shape, exactly like `shot`
(D24), and pruned by the same pass when the travel it describes stops existing.

**Two flags, not one enum.** A chip at goal is both lofted and a shot, and the gates
differ: a shot needs a LOOSE travel, a loft needs only that the ball left someone's
feet. Only a dribble is excluded from both, and for the same reason it has no line.

**A lofted ball flies at a constant speed.** What slows a ground pass is the turf, and
a ball in the air is not touching it, so `ballAt` drops its `easeOutQuad` for a lofted
one. This is not a detail: with the deceleration left in, the ball covers three
quarters of the distance by the time the arc peaks, arrives beside the receiver still
at full height, hangs there and drops vertically. Constant speed puts the apex at the
midpoint of the flight in space as well as in time, which is what makes it read as a
trajectory. The height itself is a plain parabola over that same progress.

**Two drawings of one fact.** From above there is nowhere for height to go but into
the size of the thing, so the flat board doubles the ball at the apex — a change small
enough to be subtle is one the viewer has to be told about, which defeats the point. In 3D the height is real —
`project(sx, sy, up)` lifts it, the shadow stays on the grass, and the gap between them
is what reads as height. Depth-sorting still uses where it stands, not where it has
got to in the air.

**Rejected — a fixed arc drawn on the pitch.** A drawn parabola is a picture of a
trajectory rather than the ball following one, it would have to be un-drawn from the
flat board where the ball is already in the air, and it does not animate.

## D46 — A squad follows the account, and there is only ever one library
Squad presets shipped in M10 as a `localStorage` library and stayed there through D39, so a
coach's boards followed their account and their XIs followed their browser. Signed in, the
library is now the account's: `presets` in D1, one row per preset.

**One row per preset, not the library as a blob.** The editor holds the library in memory for
a whole session, so a whole-library write always carries a list that may be stale — and
deleting someone's squad because the other tab had not seen it yet is a silent loss with no
conflict to detect. A row per preset makes two devices touching two different squads two
independent writes. No version and no 409 either: a preset is one squad, replaced whole, and
there is nothing to merge when two devices edit the same one.

**One library at a time.** Signed in, nothing is written to `localStorage` — not even as a
cache. Which is why adoption CLEARS the browser's copy, and why the offline case shows nothing
rather than falling back to it: a second library is one nobody is reading and everybody
eventually has to merge, and a squad saved into it is one the coach looks for on their other
machine and does not find. An empty list saying the account cannot be reached is the honest
answer.

**Adoption is offered once per sign-in and deduped by name and shape** — `replaceable`, the
same rule a re-save uses. It is offered again after signing out and back in, so without the
dedupe a decline followed by local edits would leave two of every squad. The browser's copy is
cleared only if every preset landed; a partial adoption keeps it and the next offer finishes
the job.

**The body is stored opaquely**, checked for size and well-formedness only, exactly as
`boards.doc` is. `presetSchema` validates in the browser, where it has to run anyway — a preset
still arrives from `localStorage` with no server involved (D31). The id and label are the row's
own columns, so a hand-written body cannot rename or re-address itself.

## D47 — Links have a scene range; attention does not carry
Two ways of saying "this, here", built on the same idea and deliberately not on the same field.

**A link gets the range an annotation already had** — `from` and `to`, scene IDS so reordering
carries the unit along. Both ends are OPTIONAL, unlike an annotation's: a link written before
ranges existed has neither, and neither means every scene, which is exactly what those links
have always done. No migration, and every `#d=` link published before this still opens saying
what it said. The rule itself moved to `board/range.ts` rather than being imported out of
`annotations.ts` — links importing annotations is the first step toward the merge AGENTS.md
forbids, and `scenes.ts` could not hold it because it already imports `annotations.ts` and
would have closed a cycle.

**A highlight is `Scene.highlight`, a record of entity id to colour.** A record and not a list
because it carries a value, which is the distinction `travel` and `delay` already make against
`hiddenRuns`. It is per scene and per entity, which is the axis the thing actually varies on —
a player is in every scene, and what changes is whether they matter in this one.

**It does not carry forward** (D41 does not apply). A position is a fact that stands until
something changes it, so a drag reaching into the scenes nobody meant anything by is right.
Attention is about one moment, and copying it forward would say something the coach did not.

**The glow is interpolated, not switched.** `Resolved.index` is the scene being travelled INTO,
so anything keyed off it alone appears the instant a transition starts. That is right for a
zone and wrong for a halo, where it reads as a rendering fault — so strength rides the same
easing the positions do and the glow comes up as the player arrives. During a hold the two
scenes are the same one and `u` is 1, so it collapses to on-or-off with no special case. Where
the two ends disagree on colour the destination wins: cross-fading two hues would spend the
whole transition showing a third colour neither scene asked for.

**A halo, not a ring, and never a pulse.** The board already draws a ring for selection and
another for hover; a third would read as a third selection state rather than as emphasis. It is
drawn in the billboard pass, or it lands squashed into the grass in 3D, and in one pass under
all the tokens rather than beside each — tokens overlap, and a halo drawn with its own token
would sit on top of a neighbour drawn a moment earlier. `drawBoard` is handed `t` and could
animate a pulse deterministically, but a glow that changes every frame is precisely what makes
a GIF's palette crawl (D29).


## D48 — The 3D view is selectable; it is still not placeable
D34 made the angled view presentation only, and the reason given was grab margins: a metre
near the camera is many more pixels than a metre at the far touchline. That is an objection to
DRAGGING, and it was applied to the whole pointer surface — so a selection made in 2D survived
into 3D with no way to clear it, and nothing could be picked or acted on there at all.

One gate becomes two. `live` is any pointer input, which the angled view now has: click,
shift-click, marquee, click a connector to take its members, click empty grass to clear,
double-click to rename. `canPlace` is editing by POSITION — dragging entities, run handles,
drawing and moving shapes — and that stays flat. Everything the panels offer is an edit to the
document and never cared how the board was being looked at, so linking, colours, kit,
highlights and restyling a shape all followed for free.

**The board splits in two, and so does hit-testing.** Anything lying on the GRASS — zones,
connectors, the sweep of a marquee — is tested by turning the pointer back into a place on the
pitch and handing it to the flat tests unchanged. Anything STANDING — a token, the ball, a text
label — is a billboard whose pixels are nowhere near the grass beneath it, and is tested in the
space it was drawn in. That second half is what answers the grab-margin objection rather than
working around it: the target is the pixels, so the grab area is the size it looks at either
end of the pitch.

**The ground map inverts exactly.** `rawY = b·C/(d − b·S)` rearranges to `b = R·d/(C + R·S)`,
so `unproject` is one expression rather than a search. Above the horizon it returns NaN, because
there is no ground there and a click must not come back as if there were.

**One camera.** `cameraFor` is built by the renderer and by every hit test, from the same call.
Rebuilding it beside the pointer handling would be a second answer to "where is this player on
screen", and the two would drift the way preview and export would.

**The marquee is a region of the PITCH, not of the screen.** Its corners are unprojected as they
are dragged, so it lies on the grass, warps with it, and `entitiesInRect` needs no 3D of its own.

**A shape is selectable and restylable, not movable.** Handles are not drawn under the camera
and not tested for: a grab point that cannot be dragged is a promise the view does not keep. A
draw tool left armed in 2D falls back to select in 3D rather than making every click do nothing.


## D49 — Players and their runs are edited in 3D; the drawing is not
D48 opened the angled view to selection and left every positional edit flat. Half of that
holds and half of it does not, and the line falls between the PLAY and the DRAWING.

**A player moves.** A token is drawn where it stands — `billboard()` puts its centre exactly on
its projected ground point — so the delta between two unprojected pointer positions moves it
under the cursor exactly. Nothing in `moveEntities` had to learn about the camera; it already
took a delta in pitch metres, and that is what it gets.

**A run bends.** Curve handles are pitch coordinates drawn INTO the ground layer, so they warp
with the grass like everything else on it. `hitTestHandle` and `dragHandle` already spoke pitch
metres, and the unprojected point is exactly right for both. No new geometry, only a gate.

**The drawing stays flat**, and not for want of an inverse. A freehand stroke sampled through a
warp is not the stroke that was drawn, and a rectangle held axis-aligned in pitch metres while
the cursor traces a trapezoid is not the rectangle either. A shape under the camera is
selectable and restylable — colour, text, size — and that is the whole of it.

**Precision up-pitch is the real cost, and it is accepted rather than solved.** The projected
full pitch is nearly square, so 105 m along maps to roughly the pixel height that 68 m across
maps to in width: one pixel up-pitch is about 1.5x more metres than one pixel sideways, and the
taper adds ~13% at the far end. Placing someone two metres further forward is a twitchier
movement than sliding them two metres wide. That is what a perspective view costs, every 3D
editor pays it, and the flat board is one click away for the fine work.

**Above the horizon there is no ground**, and `unproject` says so with NaN. One `onGrass` check
covers every consumer of a point: a drag holds where it was rather than putting NaN into a
position, and a gesture released up there commits from its last good move.


## D50 — A drawing moves in 3D; only a label's handles stay behind
D49 drew the line between the play and the drawing, and moving an existing shape turns out to
sit on the play side of it. Creating one still does not: a freehand stroke sampled through a
warp is not the stroke that was drawn.

**A shape on the grass moves and resizes.** Zones, arrows, lines and freehand are pitch geometry
drawn INTO the ground layer, so they warp with it and their grab points warp with them.
`moveAnnotation` and `dragAnnotationHandle` already took pitch metres, and the unprojected
pointer is exactly right for both. Nothing new, only a gate.

**A label moves, and its handles do not come with it.** The words are a billboard; its handles
are computed in pitch metres around the anchor, which under the camera puts them nowhere near
the type they are supposed to be resizing. So a label under the camera is moved and restyled,
and widened on the flat board — which is why `drawAnnotationChrome` takes a `handles` switch and
the tilted path turns it off for text and on for everything else.

**A ground delta moves a label correctly, and the first guess that it would not was wrong.** The
anchor is a pitch position and the words are drawn at its projection, so moving the anchor by
what the cursor's own place on the grass moved by puts the label back under the cursor. What a
ground delta cannot do is keep the GRAB POINT pinned: the offset between cursor and anchor is
held in metres, and a metre is worth more pixels as the label comes toward the camera, so a
label grabbed by its corner drifts by the taper — about 13% across the length of the pitch.
Pinning it exactly would mean carrying the grab offset in screen pixels and re-deriving the
anchor every frame, which is a second kind of drag for one shape. The drift is smaller than the
thing being dragged.


## D67 — Half of every board was a player standing where he was last seen
A board gives every player a position in every scene — that is what a board IS — so a player
the tracker lost is drawn where he was last seen, and nothing on the finished board tells the
coach which of the twenty-two are real. Nothing measured it either. Counting the drawn
positions that have a sighting within a quarter of a second:

    board              was            now
    SNGS-067        52% real       68% real     worst scene 18% -> 63%
    SNGS-151        43%            68%          worst scene 14% -> 60%
    SNGS-147        51%            70%
    SNGS-060        61%            72%
    eleven clips    43-63%         59-82%       worst scene 13-63% -> 56-65%

A coach found it before any metric did: *"at the end you make up something"*. The end is where
it is worst, because a window's last frames are the ones a track stops at — that is what made
them a candidate boundary.

**`coverage` measures a SPAN, and that is the hole the rest fell through.** First sample to
last: a track with a two-second gap in the middle covers the window completely, clears every
floor, and is drawn standing still through the gap. `witnessed` measures the samples instead —
the union of what each one can honestly speak for — and everything that asks "how much of this
player did we see" now asks it that way: the fielding filter, the keeper pick, the per-side
ranking and the window objective.

**Three rules, and they are all refusals.**

- `MIN_BOARD_DENSITY` — a passage whose fielded roster is less than 70% witnessed is not
  chosen. Honesty is a CONSTRAINT and not the objective: maximising watched football alone
  fields two players for twelve seconds over eight for three, because it cannot see how many
  people are on the board. The roster still decides, but only among honest passages.
- `SCENE_BACKED_FLOOR` — no scene where under 65% of the roster is on screen. `chooseScenes`
  walked straight into this: it splits where a player deviates furthest from their
  interpolation, and a player the tracker just lost deviates hardest of all. The frames it
  liked best were the least real ones on the board.
- The passage is trimmed at both ends to where the roster is actually on screen, which is what
  the coach was pointing at.

**What it costs is duration, and that is the honest price.** SNGS-067 goes from 25.2 seconds to
3.9, SNGS-060 from 26.0 to 9.0. The football is not lost — it was never on those boards, it was
drawn from memory. What is left is short because THE TRACKER IS SHORT: a board can only be as
long as the roster is watched, and at today's fragmentation that is a handful of seconds. The
fix for board length is upstream, not here.

## D78 — A one-touch pass is a change of direction, not a hold
A coach, on a Porto possession highlight: *"it shows the Porto GK pass to the opposition,
which does not happen in the clip. Also the quick triangle associations are not present."*
Two faults, and the second is the more interesting.

**`carrierAt`'s hold test asks who KEEPS the ball**, which is what tells a receiver from a
player the ball merely flew over (D71) — and it is exactly wrong about the football a coach
most wants drawn. One-touch play is nobody keeping it: the ball arrives, leaves in a new
direction, and the man who did it never has it for the 0.4 s the test asks for. So the board
drew a move of six passes as one player carrying the ball forty metres.

`touchedAt` answers the other question: who turned it. A change of direction beside somebody
is the thing a fly-over cannot fake, because a ball crossing a player carries straight on.
Speed is required on both sides of the turn, so a metre of position noise on a dawdling ball
— which this camera has — cannot become a right angle. Where the hold test says nothing, the
turn does.

**And events may sit closer together than scenes.** `MIN_SCENE_GAP_S` exists to stop the
deviation test describing a jittery detector; a pass is not jitter. At 0.4 s the second and
third passes of a quick exchange land inside the first's shadow and are dropped, so events now
have their own 0.2 s gap.

**Measured across the six clips with truth, one change at a time:**

    passes drawn vs played        drawn   right   precision   recall
    before                          11       9       82%        38%
    + the touch                     13      10       77%        41%
    + the event gap                 16      13       81%        52%

Fourteen points of recall for one of precision, and the coach's own board goes from three
named carriers to five. The gap trades four points of precision for seven of recall on its
own, which is the one judgement call here: an invented pass is this project's expensive error
(D71, D72), and 0.2 s was still chosen, because a possession highlight with the possession
taken out is not a board a coach can use either.

**The keeper's pass to nobody in particular.** The other half of his report was simpler and
worse. The player who received it wears a kit the split could not read — his signature sits
exactly between the two sides — so D72 declines him, the board does not field him, and
`nearestTo` stepped over him to the next player along, who was an opponent. A track nobody can
name now BLOCKS: nearer the ball than anybody nameable means nobody is named. Officials are not
blockers — `unknown` means the side could not be read, `referee` means it was read and there
isn't one.

**Build that list from the FILE, not from the roster.** The first cut filtered the unnameable
tracks out of a list that had already dropped them, so the blocker was an empty array and
measured as free. It is not free: the six clips with truth go from 13 right of 16 drawn to 12,
and two boards shift by a scene, because a blocked frame changes which events the window is
trimmed around. One pass across a sixteen-event yardstick, against an invented turnover on a
coach's own clip — and a wrong-team error is the one this project has twice called the expensive
one (D71, D72). It ships.

**`leftBehind` had the same shape of hole.** It refused to judge a holder whose track had run
out, which is the case that matters most: the board draws such a holder at his last known
position with the ball glued to him, so a sighting sixteen metres away makes that picture a lie
whether or not he is still tracked. Not NAMING a carrier needs evidence the player is there
(D65); dropping one does not. That is what kept a keeper holding the ball through the pass he
had just played.

**What none of this can do is put the missing player on the board.** The receiver is a track
holding two people, which is football-tracks D84 — both ways of catching that were measured
there and refused. So the pass out of defence is drawn as the ball arriving at a spot nobody is
named at, which is what the file actually knows: the coach's sequence — keeper, to the middle,
back to a defender, forward again — now reads off the board with one player missing from it,
rather than with the ball on the wrong team's boot.

## D77 — The board wears the kits from the clip when the file knows them
Pitchboard paints `home` red and `away` blue, and the importer calls `home` whichever side
defends the nearer goal (football-tracks D63). On a coach's own clip that made Manchester
United, in red, the blue team — and every sentence about the board after that needed
translating: *"the blue team (which is man united) loses the ball to a red player"*. Two rounds
of diagnosis on this repo went past each other for the same reason.

`tracks.json` now carries an optional `kits` — the two sides' shirt colours, measured off the
shirts themselves (football-tracks D81) — and `buildSquad` uses them where they are there. The
text colour follows from the kit's own luminance, the way a browser measures contrast: a yellow
kit takes black numbers, a navy one white, and getting that backwards hides the numbers on
exactly the kits that are hardest to tell apart.

Absent is a real answer and the commonest one: a file written before this, or a clip whose two
kits measure too close to be told apart on colour, leaves the board's own palette alone. Nothing
else changes — the same eleven boards, the same passes, the same rosters.

**And the colour is snapped to the picker's own swatches.** A measurement is `#3a81d1`; the
picker offers eight colours and nothing between them, so a board painted in measurements is one
a coach cannot re-pick, and a link he sets by hand can no longer match a kit exactly — which is
what `PALETTE` exists to guarantee. The file says what it saw and the board says it in its own
vocabulary: Everton's `#3a81d1` becomes the picker's blue, United's `#d1493a` its rose. Distance
is the redmean approximation rather than plain RGB, which calls a saturated blue and a saturated
green neighbours and would paint a red kit amber. Where both sides land on one swatch the better
match keeps it and the other takes its next choice, because two teams in one colour is not a
board.

## D76 — The ball's silences are events too, and a ball over the line is on it
Same coach, one round later: *"now the movements are somewhat accurate but the ball gets
lost."* Two faults, and between them they are the whole of what a board does with a shot.

**The board had no scene anywhere near the shot.** `handovers` sees the ball arrive, `flights`
(D75) sees it come loose — and a shot is neither, because the detector loses a ball travelling
at thirty metres a second and the next sighting is it sitting in the goal 1.7 s later. With
nothing between, the striker held it at frame 315 and the ball then drifted into the net across
whatever the next scene happened to be, two and a half seconds of it.

`breaks` marks both ends of a silence the ball moved across: the last frame it was seen where
it was, and the first frame it was seen where it got to. Both are facts; what happened in
between is not claimed. The DEPARTURE is only marked when somebody was still within the carrier
radius of it — a ball already in flight when it was last seen is mid-pass, and a scene there
splits one movement into two, which is the fault D75 exists to avoid.

**And the ball vanished at the goal.** D75 refuses to draw a sighting off the field, because
the camera model puts false positives in the crowd. But a shot ENDS off the field: the sighting
that matters most on the clip was at x = −1, a metre past the goal line, and the board drew no
ball at all in the scene a coach is watching hardest. A sighting within `BALL_EDGE_M` is pulled
onto the field instead of dropped, which draws the goal on the line; anything further out is
still dropped, which is what SNGS-060's (−1, 9) needed.

    the coach's board, by scene
    away-5 (44,19)   he has it
    away-5 (44,18)   struck
    away-8 (29,5)    taken, on the touchline
    away-8 (25,12)   carrying
    away-8 (19,23)   carrying
    away-8 (18,25)   the last frame it is his
    ball  (-0.8,35)  in the net
    ball  (-0.8,35)  still in the net

**A goal is drawn IN the goal, and stays there.** The first cut of this pulled the sighting
onto the goal line, where it sat among the defenders who were standing on it — and the next
sighting, a metre inside the field, moved it back towards them. The coach read the whole thing
as a turnover: *"the blue team loses the ball to a red player"*, on a clip whose scoring team
never lost it. So a sighting behind the line and between the posts (`scored`) keeps its own
position, capped at the depth the board draws its goals, and every scene after it holds the
ball there with nobody named. Play is over; the board says so.

Outside the posts nothing changes — SNGS-060's sighting at (−1, 9) is a bad fit, not a goal,
and is still dropped.

Every scene's ball is now within a metre of a real sighting where one exists, against 8 to 16 m
before. **Across the six clips with truth, passes drawn against passes played go from 73% to
82% precision and 34% to 38% recall** — the first change in this area to move both. Boards gain
scenes where the ball did something (SNGS-069 nine to eleven, SNGS-116 three to five) and their
rosters, windows and watched player-seconds are unchanged.

## D75 — A ball nobody has is drawn where it is, and the moment it comes loose is a scene
The carrier model answers one question — who has the ball — and a board built only from its
answers cannot show the two events a coach cares most about. A pass whose receiver was never
tracked has one holder before it and the same holder after; a shot has a holder and then
nothing. Both come out as a player dribbling through something he actually kicked.

A coach on a Man United clip, with all three faults in one sentence: *"it's missing the initial
pass to the player that eventually runs with the ball; it is missing the shot, so when the
player goes to celebrate the board thinks it is a run with the ball when it isn't."* The file
had both events in it all along — the ball is tracked from frame 56 to 106 flying across the
pitch with nobody within nine metres of it, and again from 421 sitting in the goal — and the
importer threw both away because neither could be attached to a player.

Three rules, and they are one idea: **the ball is evidence in its own right, not only a pointer
at a player.**

- `flights()` — the frames the ball comes loose, meaning the first sighting of each stretch
  with nobody inside `LOOSE_M`. Those join the handovers as scene candidates and as events the
  window may not be trimmed past. `handovers` can only see where a ball ARRIVES; the moment it
  leaves is an event whatever happens next.
- `leftBehind()` — a sighting that puts the ball more than `LOOSE_M` from the holder ends his
  possession, whether or not anybody else can be shown to have taken it. Carrying a holder
  forward (D43, D74) reads the ball's silence, and a sighting is not silence.
- `ballPos` on any scene that names nobody and has a sighting on the field, not just the first.
  D44 already described this case -- "the middle of a long ball, where whoever kicked it is
  thirty metres behind it" -- and only ever implemented it for the restart.

The coach's board goes from `away-8 away-8 away-8 away-8 away-8` -- one man carrying the ball
for nine seconds through a pass, a run, a shot and a celebration -- to `- ball(30,10) away-8
away-8 away-8 ball(2,36)`: the ball arrives from off the passage, he takes it and runs, and it
finishes in the goal.

**Measured across the thirteen boards:** passes drawn against passes played goes from 70% to
73% precision and 31% to 34% recall, the roster, window, density and `seen` are unchanged
everywhere, and three boards gain a scene (SNGS-060 six to nine, SNGS-100 three to four,
SNGS-110 four to five) because a flight is now a candidate. `leftBehind` at the carrier radius
instead of `LOOSE_M` was measured at the same time and is worse for the same aggregate: it
fires on the z = 0 shadow of a ball its holder still has.

**Two guards this needed.** A sighting the camera model puts off the field is out of play or a
false positive, and drawing it takes the play off the board -- SNGS-060 had one at (-1, 9) --
so `ballPos` is only ever a sighting inside the touchlines. And the scenes BEFORE the first
flight are no longer handed to the player who eventually takes the ball: the pass that put it
in the air came off somebody else's boot, and filling them draws him passing to himself.

**And a third, one round of coach feedback later**: *"the pass is still missing as the ball is
without a holder at the start and magically gets passed to the correct player."* Right — a
flight drawn with nobody before it is a ball arriving out of thin air, which is the same fault
seen from the other side. `kickedBy` names the player it came off: a flight begins with the
ball already clear of everybody, so the kicker is at the last sighting before it where somebody
was still within reach, looking back no further than `KICK_S`. Those opening scenes are his.

The board goes to `away-5 ball(30,10) away-8 away-8 away-8 ball(2,36)` — one team's player
plays it, the ball crosses, another takes it and runs, and it ends in the goal. The thirteen
boards, the pass precision and the pass recall are all unchanged by the addition; the only
other board it moves is SNGS-100, whose opening scene now names the same player its second
scene already did.

**What this cannot do is see further back than the ball.** On that clip the first sighting is
frame 56, with the ball already rolling, so the kicker is the player it was nearest when it
first appeared. If the detector never saw the ball at the passer's feet, no rule here invents
him.

**And one round after that**: *"the pass is getting divided into two movements, instead of a
straight pass."* Right again, and it is the ball position that has to go. A flight with a
player at BOTH ends is already a pass — the carrier changes from the man who struck it to the
man who took it, and that is one movement on the board. Drawing the ball at its own position in
between makes it two hops. So the ball is drawn on its own only where the carrier model cannot
draw the event at all: a shot, a ball that runs out of play, a pass to somebody the tracker
never held. Where both ends are known the flight scene holds the KICKER, and the pass draws
once.

That also generalised the oldest rule in this area. "The ball starts with whoever first takes
it, rather than materialising in scene three" was written for the opening scenes; it is really
about any scene the file could not name a holder at, so it now applies wherever possession
resumes — the scenes between a pass and its receiver belong to the receiver. What it must not
touch is a scene where the file DENIES a holder rather than failing to name one (D74's silence,
`leftBehind`'s sighting), and those two cases are now tracked apart. Silence before anybody has
held the ball denies nothing: it is the opening of a board, not a statement about possession.

The coach's board ends at `away-5 away-5 away-8 away-8 away-8 ball(2,36)` — one player has it,
one pass, the receiver runs, the ball finishes in the goal. Passes drawn against passes played
hold at 73% precision and 34% recall across the six clips with truth, and the thirteen boards
are unchanged but for SNGS-060, which draws one more pass and one less loose ball.

## D74 — A holder may only stand for as long as the ball's silence is short
A carrier stands until somebody else takes it, and the flight between two holders is the pass
(D43, D44). That rule is a reading of the ball's SILENCE, and silence stops meaning "still his"
once it is long enough for the play to have moved on.

A coach, on his own clip: *"it shows that the away team held possession but it is not true, a
home player made a run on the left and passed it to the second post for the goal."* Half of that
was the producer handing one track two players, which is football-tracks D78. The other half is
here: the ball went unseen from frame 121 to 178 — 1.8 s, exactly the run he was asking about —
and the board handed the whole passage to whoever held it before the gap. Nothing in the file
stood behind that claim.

So a scene names nobody once no sighting stands within `CARRY_S` (1 s) BEFORE it. Backwards
only: a sighting after the scene says where the ball got to, not who had it, and the claim being
carried is a claim about the past. Naming nobody is a real answer (D44) and the one a coach can
work with — a board that shows possession stopping is honest about what was tracked, and a board
that shows the wrong team passing is not.

**It costs nothing measurable, which is the point.** All thirteen boards are byte-identical at
999 s, 2 s and 1 s — same roster, window, density, travel, curves and passes — and passes drawn
against passes played holds at 70% precision, 31% recall across the six clips with truth. The
only board that moves is the coach's, where the last scene stops claiming a carrier it cannot
support. **0.5 s is where it starts costing**: SNGS-060 loses three scenes of real possession
and gains nothing, so 1 s ships.

This is the second attempt at that complaint. The first was a runner-up margin in `carrierAt` —
name nobody unless the nearest player is nearer by 1.5 m than the next — and it was measured and
thrown away: between two players running together it stops naming anybody at all, and possession
collapses onto whoever held it first. The fault was never the margin between two candidates; it
was carrying a candidate across a stretch with no evidence in it.

## D71 — The ball flying over a player is not a pass to him
A coach watching SNGS-121: the ball is lofted forward from the start, and the board draws a
short pass first and the long ball second. And the home team keeps possession throughout while
the board shows it changing hands. Both are invented events, and an invented event is the most
expensive thing this importer can produce — it is drawn as football and reads as football.

**The cause is `z = 0`, one layer down.** A ground homography puts a lofted ball where its
shadow is, so the ball's position on the board sweeps across the pitch during a flight, and
every player it sweeps over is for one frame the nearest. `carrierAt` read that frame by frame
and called it possession.

**Speed cannot separate a fly-over from a reception.** Measured on ground truth, half of all
REAL receptions show the ball moving faster than 9 m/s, because a pass arrives through the air
there too — SoccerNet's ball is the same shadow. Duration can: a real hold lasts 0.4-0.6 s at
the median, and every hold our own ball produced was under 0.3 s.

So the carrier is whoever KEEPS it: the nearest player must still be nearest through
`HOLD_S`, over `HOLD_SHARE` of the ball's sightings in that window. Every sighting counts and
not only the ones with somebody near, because a ball crossing open ground has no rival claimant
and "nobody else was nearer" is not possession — a test caught that, having been written to.

    rule          passes drawn   of them real   precision   recall
    as it was          28             17           61%        60%
    hold 0.2 s         22             15           68%        60%
    hold 0.4 s         15             11           73%        47%

**0.4 s ships even though 0.2 s is free**, because the two errors are not equal. A pass that
never happened is a turnover a coach will try to coach; a missing one leaves the play looking
continuous, which it was. On SNGS-121 every pass the board now draws is one that was really
played, and the possession flip the coach queried is gone.

**One honest limit on all of this.** SoccerNet does not annotate possession, so "the passes that
really happened" here are the same nearest-player reading applied to the annotated ball — which
is also a z = 0 shadow. Where our board and that reading agree, both could still be wrong. The
one remaining `away` moment on SNGS-121 is exactly such a case: the ground truth calls it away
too, and only a person watching the clip can say.

## D73 — The importer never judges whether the football is any good
A coach, after SNGS-069 came out accurate and tactically dull: *"you don't need to decide that.
The user will use a clip he deems good enough for a board; all we need to concern ourselves with
is being as accurate as possible, to save the user as much time as we can."*

So the chooser does not rank passages by football. Not by how far the ball progresses, not by
whether the play reaches the final third, not by shots or box entries — all of which were on the
table and are measurable, and all of which decide FOR the coach what is worth looking at. The
clip is already their judgement; the board's only job is to be true to it.

What the chooser may still weigh is the difference between representing the clip and
misrepresenting it: whether a passage can be drawn without inventing most of it (D67), whether
it fields a team, and whether it contains the ball events the clip contains (D68). "Where the
football IS" is a claim about the clip. "Whether the football is interesting" is a claim about
the game, and it is not ours.

The same rule settles the three clips whose boards name no carrier at all — SNGS-067, 075 and
116. A board with no ball is thin, and loosening what D71 and D72 tightened to put one there
would be inventing passes to make a clip look better. They stay ball-less and honest.

## D72 — A turnover that gives the ball straight back never happened
The last of the fly-over faults, found by the same coach on the same clip. SNGS-121's board had
the home team passing across the pitch — correct — with one scene in the middle where the blue
team held it. In the clip that never happens.

Pulled apart at that scene: **our ball was seven metres from the real one**, sitting on top of a
track that was itself six metres from any real player. Both the ball and the tracks were
displaced in that moment, which is registration, and no rule about carriers can put a ball back
where it was. `carrierAt`'s hold test (D71) cannot see it either — the phantom holder is nearest
for the whole window, because the phantom ball follows him.

What gives it away is the shape. A real turnover changes what the other side does next; one that
lasts a single scene and hands the ball back to the side that had it is the measurement
wobbling. `steady` reverts those, across SIDES only — one home player to another and back is an
ordinary exchange of passes and says nothing about control.

**Measured, it costs two points of precision, and it is right anyway.** The ground truth for a
"real" handover is the same nearest-player reading of an equally flat ball (D71), so it endorses
the very fly-over being removed: our score goes 85% → 83% precision, 47% → 43% recall, while the
board goes from wrong to right on the one clip a coach has actually watched. Where a metric and
a person who watched the video disagree about the video, the person is the ground truth.

SNGS-121 now reads home throughout, with five passes drawn and all five real.

## D70 — Cutting a clip into several plays: built, and scrapped on sight
An honest board covers about a third of a thirty-second clip (D67), so one board leaves most of
the football behind — SNGS-060 holds nineteen changes of possession and its best passage holds
four. Cutting the clip into the passages that are honest recovered all of it: two to four
passages per clip, every event, nothing invented to join them. It shipped as `boardsFromTracks`
with a strip in the top bar, and it is reverted.

**A coach looked at it and said a clip is one play.** Reading SNGS-121 as two boards did not
answer the question he had, which was what happened in the clip — the split is a fact about the
tracker's stamina, not about the football, and asking a coach to read the same move in two
halves puts our problem in front of him. That is the whole reason: the feature worked and was
answering a question nobody asked.

**And it hid a worse fault by being interesting.** Checking those boards turned up two invented
events on SNGS-121: the ball is lofted forward from the start, and the board draws a short pass
first and the loft second; and the home team keeps possession throughout while the board shows
it changing hands. Both are `carrierAt` and `handovers` rather than the window — a phantom
possession change is drawn as football and reads exactly like football.

**The lesson is the ordering.** Covering more of a clip is worth nothing while the events inside
the cover are made up. The board was chasing quantity when what it had was wrong, and no amount
of passage-cutting fixes a pass that never happened. Ball attribution comes first.

## D69 — A run shorter than the error that produced it is not a run
The camera model puts a player 0.5-1.5 m from where they stood, independently at every frame,
so a player standing still arrives at the next scene a metre away — and the board draws that as
an arrow. Measured across five boards: **561 runs drawn, 35% of them under a metre and 48%
under two**, with a bezier fitted through a fifth of that. Between a third and a half of what a
coach was being asked to read was the measurement wobbling.

A player now keeps the position they were last DRAWN at until they have gone `STILL_M` from it.
Against the drawn position and not the file's, deliberately: a real drift of 1.4 m a scene
accumulates and the player moves once it is a metre and a half of football, where comparing
with the file each time would freeze them forever.

    runs drawn        561 -> 332      under 2 m   48% -> 10%
    median run        2.1 m -> 3.9 m  curves      220 -> 201

Nothing else moves: SNGS-060 keeps 49 m of travel and every event, SNGS-121 45 m. What went is
arrows on players who were standing still. No scene was left empty by it either — every scene
still has eight to sixteen players moving into it, and the two that have one or two are passes.

## D68 — Honest is not enough: the board has to have the football in it
D67 made the boards true and emptied them. The same coach: *"067 is 2 scenes and nothing
happens"*, *"there's no kickoff, no back pass, no header after the GK boots it"*. Three separate
faults, and the first two were mine from D67:

- **The scene floor was deleting the events.** It was applied to possession changes as well as
  to the recursive split, and at a kick-off the rest of the roster is by definition not gathered
  round — so the one moment worth drawing was the one it refused. An event is an observation of
  the ball and the two players either end of it; the floor is for scenes the split INVENTED.
- **The end-trim walked past the restart.** `chooseWindow` deliberately included the kick-off
  and the trim then cut it off, which is how SNGS-060 lost the thing it opens with.
- **A passage could only begin or end where a track did.** Candidate boundaries were track
  endpoints, so "the four seconds around that pass" was never in the candidate set unless a
  player's track happened to start there. On SNGS-067 every passage holding a change of
  possession was too long to be honest and every honest one held no football — the candidate
  that was both was never offered. Events are boundaries now.

**And the objective itself was wrong twice.** Ordering honesty, the roster and the ball
sacrifices whichever comes last, and all three orderings were measured: roster first walks past
every pass (possession changes happen where players occlude each other and tracks fragment);
ball first empties the pitch to six players; honesty first produces two scenes of nobody moving.
So honesty and the roster are FLOORS — `MIN_BOARD_DENSITY`, `MIN_ROSTER_SHARE` — and the ball
chooses among what clears them.

**A restart is an event, not a trump card.** D53 gave any passage containing a set piece
priority over any passage without one, and SNGS-067 came out anchored to a kick-off with all
four of its changes of possession outside the window: a board of the one moment nothing happens
after. It still decides the passage, but only where the passage has something else in it too —
or where the clip holds no other event at all, which is what D53 was really about.

    board          players   window   real   events kept / in window / in clip
    SNGS-067         16       5.2 s   60%           1 / 1 / 4      kick-off kept
    SNGS-060         15      11.6 s   70%           4 / 5 / 19     kick-off kept
    SNGS-069         20      15.0 s   75%          10 / 12 / 12
    SNGS-121         17      18.1 s   67%          11 / 12 / 19
    SNGS-116         18       8.5 s   58%           8 / 10 / 16

**What the last column says is the real limit, and no rule here can move it.** SNGS-060 contains
nineteen changes of possession and an honest board holds five, because honesty caps the window
at about a third of the clip and the football is spread across all of it. A board covering the
whole clip has to be able to leave a player OUT of a scene — which `BoardDoc` cannot express,
every player needing a position in every scene — or go back to drawing them from memory. That
is the next real decision, and it is a schema one.

## D66 — A player has to be WATCHED, not merely present for a share of the window
`MIN_COVERAGE` is a fraction of the chosen window, and `chooseWindow` maximises how many
tracks clear it. Those two together are a ratchet towards short passages: halve the window and
every fragment's coverage doubles, so more of them clear the floor, so the count rises — while
the football on the board falls. Nothing in D54's cap-and-slack can see it, because the count it
caps is the quantity being inflated.

SNGS-147 is the pure case. The board was **nineteen fragments over 3.2 seconds** of a
thirty-second clip, and those nineteen shirts are **eight real players** seen for about a second
each. With a floor of 1.5 seconds of actual observation it is fourteen fragments over 11.6
seconds, and **eleven real players**.

    boards                       real players   window     observed player-seconds
    eleven SoccerNet clips        177 -> 180    183 -> 192 s     1887 -> 1934

Ten of the eleven are unchanged to the byte; SNGS-147 is the whole difference. **That corrects
D54**, which concluded 147 "barely moves, because nothing here can fix it... that is the
upstream id switches, not the objective". It was the objective.

**The floor is in seconds because a share cannot be defended.** A player watched for under a
second and a half has not made a run, and a board that draws one for them is inventing it —
that is a claim about football, and it is the same claim at any window length. Measured either
side: at 1 s SNGS-147 stays broken (3.6 s, 17 fragments); at 3 s the Nottingham clip falls from
20 players to 12 and the Rio Ave goal from 14 to 5. It must also stay under `MIN_WINDOW_S`, or
a window trimmed to the minimum fields nobody at all.

`chooseWindow` and the fielding filter in `index.ts` apply the same two tests, deliberately: a
window chosen for a roster the importer then declines to field is a window chosen for nothing.

**The obvious fix was measured first and is worse.** Scoring each window by its observed
player-seconds directly — coverage times duration, summed over the best eleven a side — is the
quantity D54 judges boards by, and as an objective it trades the team for the clock: across the
same eleven clips it buys 86 seconds by losing **21 real players** (177 -> 154), because
player-seconds are indifferent between eleven players watched briefly and four watched
throughout. A roster floor on top of it (70%, 85%, 95% of the fullest window's count) does not
recover them: at 95% it reproduces the old behaviour, and every looser setting spends people
for seconds. The defect was never the objective's units; it was that the roster it counts is
inflated by short windows.

## D65 — A player who is not on the pitch yet cannot be carrying the ball

`carrierAt` guarded one side of its own comparison. The ball had to have been SEEN near the
moment asked about — *"a sighting from another moment says nothing about this one"* — and the
player had no such test. `positionAt` clamps outside a track's range, so a player first
detected at frame 268 reports that position when asked about frame 1, and the nearest-player
search happily returns them.

Measured on SNGS-060, whose clip is a kick-off: at scene frame 82 the ball was given to a
player whose track begins at frame 120. The consequence is the one a viewer notices — the
ball attaches to somebody standing near the centre spot who is not there, the "previous
holder keeps it" rule carries that across the following scenes, and the kick-off is drawn as
a dribble. The clip's defining moment is missing from the board built from it.

The fix is the ball's own rule applied to the player: a track is a candidate only where it
actually covers the frame.

That leaves the leading scenes of a restart with no carrier, which is correct and is what
`ballPos` is for. They now hold the ball's measured position instead of being backfilled with
whoever eventually picks it up — the ball sits on the spot and travels off it, which is the
kick. This is the one place that position can be trusted: `tracks.ts` warns that a ball in
FLIGHT lands metres from where it is, because the homography assumes z = 0, and a ball at rest
on the ground has no such error.

The backfill survives for the case it was written for. Where the ball was not seen at those
scenes either, it still starts with whoever first takes it, rather than materialising in scene
three.

**Two wrong diagnoses came first and both were measured before being believed.** That no scene
falls at the handover — a scene was seeded there, and it moved one scene by ten frames and
improved nothing. And that the receiver is not a fielded player — inferred from no fielded
player being within four metres of the ball, which is exactly what a pass in flight looks
like, since a kick-off may be played anywhere in one's own half.

## D54 — The window counts what the board can field, and buys seconds with a fragment
`chooseWindow` maximised the number of covered tracks with duration as a tie-break at exactly
equal count. Two things are wrong with that, and they only show up together.

**The count is fragments, not players.** A track holding an impossible jump is cut before the
window is chosen, and the upstream tracker's id switches make that frequent: 56 tracks arrive
as 147 fragments on one clip, 66 as 197 on another. An extra covering fragment is routinely a
player already on the board.

**And the board fields at most `MAX_PER_SIDE` a side**, so a window scoring 26 and one scoring
25 often produce the same eleven. Counting past the cap optimises what is then discarded.

Without slack, one of those fragments outweighs any amount of football: the fullest window on
SNGS-147 is 19 fragments over **2.8 seconds**, against 18 over 8.6. So each side is now scored
against the cap, and the longest window within `WINDOW_SLACK` of the fullest is taken.

**The two rules need each other, which is why neither shipped alone.** Capping alone lets a
side with two fragments decide the window once the other is past eleven — SNGS-067 goes to 3.4
seconds. Slack alone buys duration by gutting a side: SNGS-147 trades 11 v 8 over 2.8 s for
**17 v 1** over 8.6 s, which is not a board. Together they hold.

Measured over eleven clips as mean coverage times duration — the seconds of actually observed
player-time a board is built from, rather than its length, which flatters interpolation:

    clip        before          after
    SNGS-067    6.6s  ->  12.8s      SNGS-060   13.8s -> 19.5s
    SNGS-075    7.8s  ->  12.1s      SNGS-069   11.1s -> 17.4s
    SNGS-116    6.2s  ->   8.6s      SNGS-066    9.6s -> 11.6s
    SNGS-100    4.3s  ->   6.9s      SNGS-151    5.4s ->  7.3s
    SNGS-110    6.2s  ->   7.2s      SNGS-147    1.7s ->  1.8s
    SNGS-121   11.4s  ->   9.5s

Ten of eleven improve. The coverage SHARE falls on most of them — a longer window is a larger
denominator — and that is the trade being made deliberately: more real football on the board,
a larger fraction of it interpolated between real observations.

SNGS-121 is the one regression, and it is the cap doing what it was asked: 11 v 7 over 20.2 s
becomes 9 v 11 over 16.5 s. A more complete away side for four fewer seconds.

SNGS-147 barely moves, because nothing here can fix it. Its away side is only tracked early and
its home side late, so no long window holds both. That is the upstream id switches, not the
objective.

## D53 — A set piece outranks a full roster when choosing the window
`chooseWindow` maximises the number of tracks covering the passage, tie-broken by duration.
It never looked at the ball, and on set-piece footage that is exactly the wrong objective:
during a corner the players are bunched in the box occluding each other, so their tracks
fragment and the count drops, and the window reliably walked past the corner to the open play
afterwards. Four of five imports whose ball had just been fixed at the corner produced a
**byte-identical board** — the ball was now right in frames the board never opened.

A board made from a corner clip that does not contain the corner is the wrong board however
many players it has, so a window covering a restart now outranks a fuller one. Count and
duration still decide everything underneath that.

`restartAt` finds it: the ball resting within 1.5 m of a corner arc or the centre spot for at
least 0.4 s, and the frame returned is the one it LEAVES on — the kick is what has to be on
screen, and how much of the wait to keep in front of it is a question the existing objective
already answers. It is derived from `ball.samples` rather than read from a field, so it works
on every tracks.json ever written, and `tracks.json` did not have to change.

The radius is homography slack, not a tolerance — a ball on the corner arc projects a metre or
so outside the line. The rest is what separates a placed ball from one rolling past the spot.
Both were measured upstream against SoccerNet's ball annotations, where a run this finds is
right 460 times in 462.

**Free kicks are deliberately out of reach.** They are taken wherever the foul was — (21.6, 7.2),
(78.6, 10.4), (7.0, 54.6) across the sample — so they have no position to recognise, and 0 of 6
free-kick clips are touched by this. Corners and kick-offs are 12 of 13.

Measured over eleven imports: four windows moved, all of them onto a set piece that had been
missed, and seven boards are identical — including all four clips with no restart in them. The
cost is SNGS-110, which trades two away players for a window that contains its corner. The
penalty spots are excluded for the same reason as upstream: a painted white disc is what a
detector calls a ball, and a penalty is the one restart this footage never contains.

## D52 — An impossible speed is judged over a baseline, and a side holds eleven
The importer cut a track wherever two adjacent samples implied more than 12 m/s. That reads as
a fact about football, and it is really a fact about the frame rate: a speed measured across one
frame is a position error multiplied by fps. Every constant in `reduce.ts` was tuned on 32 fps
footage, where 12 m/s is 0.37 m between frames. The first 48 fps clip put the same threshold at
0.25 m — under the noise a carried homography leaves on a position — and 5.9% of its steps read
as teleports. Its 77 tracks arrived as 392 fragments.

Nothing about that failure looked like a bug. The board validated, its fidelity was the best of
any clip (0.11 m median), and every existing test passed. What it had actually done was give up:
`coverage` is a fraction of the window, so a shorter window flatters every track in it, and the
chooser walked down to the 2.5 s floor where the fragments still looked like players. The result
was 2.6 seconds of football with **no curved run in it at all** — the one thing the pipeline is
for — and the fidelity score was excellent precisely because there was nothing left to get wrong.

**The step says where a cut goes; a baseline says whether there is one.** Only the step is local
enough to place the boundary and only the baseline can tell a jump from noise, so a cut needs
both to agree. Averaging three samples either side shrinks noise and leaves a real jump where it
was. 392 fragments became 132, the window went from 2.6 s to 7.3 s, and 0 curved runs became 22.
The window objective was never touched — it had been reporting the fragmentation, not causing it.

**A side holds eleven, because the game says so.** Splitting is safe where the halves are two
people and lossy where they are one, so over-count survives: Nottingham still yields fourteen
home shirts for eleven players. The cap does not reunite them — nothing in the file says which
two are one, and stitching was measured and rejected upstream at one good join per bad — but a
board cannot field fourteen, and the best-observed eleven beats the first eleven found.

## D51 — Projects nest, as an adjacency list guarded in the Worker
D39 gave a user projects and a project boards, one level deep. A season's work does not fit
that: "Season 24/25 > Away > Set pieces" is the shape, and twenty-five flat folders is the same
problem with more scrolling.

**One nullable self-reference.** A materialised path or a closure table would buy fast subtree
queries at the cost of a second structure to keep in step on every move. Not worth it here: the
whole tree is at most twenty-five rows, the client already fetches it whole and derives
everything from that one list, and the only questions the server asks of the shape are the two
guards below. `ALTER TABLE` adds it, because a `REFERENCES` column defaults to NULL — which is
exactly what an existing project should be.

**Selecting a folder shows everything beneath it**, and the count matches. A folder holding only
subfolders would otherwise open onto an empty pane, which is a dead end — and this makes "All
boards" the same rule at the root rather than a special case. The cost is that a board appears
under every ancestor, so a bulk move from a parent can pull boards out of subfolders. That is
visible and deliberate.

**Two guards, both in the Worker, because it is the only place that sees the whole tree.** A
folder filed under its own descendant makes a subtree reachable from no root: it does not move,
it vanishes. And depth is capped at five, checked on a move as the new parent's depth PLUS THE
HEIGHT OF THE SUBTREE BEING CARRIED — a deep folder dropped onto a deep parent slips past a
check that only measures the folder itself. A client cannot do either check honestly: it would
still be racing another tab.

**The walks are bounded rather than trusted to terminate.** A recursive CTE over data that
already contains a cycle does not stop, and "the guard prevents that" is the reasoning that
makes the first corrupt row fatal. Every climb carries `n < MAX_PROJECTS_PER_USER`. Verified
against SQLite by forcing a cycle with foreign keys off: the walk stops at 25 instead of
hanging.

**Delete still cascades, and now it recurses** — subfolders through `parent_id`, their boards
through the cascade `boards.project_id` already had. One statement. What that costs is a
confirmation that counts the subtree, because "and every board inside it" is a lie about a
folder holding four more.

**The client tree does not trust the rows.** They arrive over the network, so `buildTree` files
an orphan at the root rather than dropping a folder and its boards out of the view, and breaks a
cycle with a visited set rather than recursing until the stack goes.


---

## Invariants

Two rules a future change is most likely to break. Both belong in `AGENTS.md`.

1. **`drawBoard` is pure.** No DOM, no React, no `Date.now()`, no `Math.random()`. If a value is
   needed, it goes in `BoardDoc` or `Viewport`. Breaking this breaks export fidelity, and the
   symptom appears far from the cause.
2. **No pixels in the document.** All coordinates are pitch metres. Breaking this shows up as
   players drifting on window resize or on a retina display.
