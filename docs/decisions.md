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
