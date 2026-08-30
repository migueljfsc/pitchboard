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

---

## Invariants

Two rules a future change is most likely to break. Both belong in `AGENTS.md`.

1. **`drawBoard` is pure.** No DOM, no React, no `Date.now()`, no `Math.random()`. If a value is
   needed, it goes in `BoardDoc` or `Viewport`. Breaking this breaks export fidelity, and the
   symptom appears far from the cause.
2. **No pixels in the document.** All coordinates are pitch metres. Breaking this shows up as
   players drifting on window resize or on a retina display.
