# Changelog

Notable changes to Pitchboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); SemVer once releases begin.

## v0.70.1 (2026-09-26)

### Fix

- **infra**: Resend's current records for pitchboard.migueljfsc.dev

## v0.70.0 (2026-09-26)

### Feat

- **account**: delete an account and everything it owns; pepper stored passwords

## v0.69.0 (2026-09-26)

### Feat

- **auth**: email and password sign-in, served from pitchboard.migueljfsc.dev

## v0.68.1 (2026-09-26)

### Fix

- **editor**: hide the team names while the ruler shows

## v0.68.0 (2026-09-26)

### Feat

- **admin**: an operator-only usage view at /admin

## v0.67.0 (2026-09-26)

### Feat

- **editor**: keep drawings out of the dark, measure the frame, pick colours from one ball

## v0.66.0 (2026-09-25)

### Feat

- **editor**: show the ruler while moving any drawing, with the span it covers

## v0.65.0 (2026-09-25)

### Feat

- **board**: highlight drawings and links, snap and align labels, fit text exactly

## v0.64.0 (2026-09-25)

### Feat

- **editor**: a guided tour, told on a demo board of its own

## v0.63.1 (2026-09-25)

### Fix

- **board**: keep text labels above the spotlight's darkness

## v0.63.0 (2026-09-25)

### Feat

- **board**: spotlight highlights, link line styles, polygons and corners

## v0.62.0 (2026-09-25)

### Feat

- **editor**: per-scene zoom, templates, export in the background, and editing polish

## v0.61.1 (2026-09-24)

### Fix

- **draw**: lay the draw tools out three across so every label fits

## v0.61.0 (2026-09-24)

### Feat

- **editor**: reset a player's move into a scene, or all his movement

## v0.60.0 (2026-09-24)

### Feat

- **editor**: a Selection panel split by scope, with pass timing in the scene bar

## v0.59.0 (2026-09-24)

### Feat

- **timeline**: the ball keeps its own time, and runs choose how they start and finish

## v0.58.0 (2026-09-24)

### Feat

- **editor**: a drawing rail, a command palette, drawn balls and outline zones

## v0.57.0 (2026-09-24)

### Feat

- **board**: the 3D view edits everything the flat board does

## v0.56.0 (2026-09-23)

### Feat

- **board**: goals with a net, a real ball, goalkeeper kits and a shadeable natural grass

## v0.55.0 (2026-09-23)

### Feat

- **import**: a board from video remembers what the importer said, and a player can switch side

## v0.54.0 (2026-09-23)

### Feat

- **board**: draw a player nobody saw faded, until the play reaches him

## v0.53.1 (2026-09-22)

### Fix

- **import**: a dribbler takes the ball, and the post is not a save

## v0.53.0 (2026-09-19)

### Feat

- **import**: pnpm board --truth, possession against the truth board frame by frame

## v0.52.1 (2026-09-17)

### Fix

- **import**: a tackle is not a turnover, and a keeper's catch is silent

## v0.52.0 (2026-09-16)

### Feat

- **import**: who has the ball, scene by scene

## v0.51.0 (2026-09-11)

### Feat

- **formations**: a board's own colours should not look like a kit

## v0.50.1 (2026-09-11)

### Fix

- **import**: a backfilled carrier has to have been on the pitch

## v0.50.0 (2026-09-11)

### Feat

- **import**: the board is the whole clip, and the eleven that cover it

## v0.49.0 (2026-09-10)

### Feat

- **import**: keep room on the board for the players the ball goes through

## v0.48.0 (2026-09-09)

### Feat

- **import**: draw a loose ball at the nearest player's feet

## v0.47.1 (2026-09-09)

### Fix

- **import**: build the blocker list from the file, not from the roster

## v0.47.0 (2026-09-09)

### Feat

- **import**: draw one-touch play, and let an unreadable shirt block the ball

## v0.46.0 (2026-09-09)

### Feat

- **import**: draw the goal, the shot, and the kits from the clip
- **import**: draw the ball itself when nobody has it

### Fix

- **import**: say a measured kit in the picker's own colours
- **import**: stop naming a holder once the ball has gone unseen

## v0.45.4 (2026-09-07)

### Fix

- **import**: name a board for the passage it covers, not just the clip

## v0.45.3 (2026-09-07)

### Fix

- **import**: a turnover that gives the ball straight back never happened

## v0.45.2 (2026-09-07)

### Fix

- **import**: the ball flying over a player is not a pass to him

## v0.45.1 (2026-09-07)

### Fix

- **import**: keep a play's corrections when moving to another one

## v0.45.0 (2026-09-07)

### Feat

- **import**: open a clip's other plays from the top bar

## v0.44.0 (2026-09-07)

### Feat

- **import**: a clip is several plays, so import it as several boards

## v0.43.4 (2026-09-07)

### Fix

- **import**: do not draw an arrow for a player who was standing still

## v0.43.3 (2026-09-07)

### Fix

- **import**: an honest board still has to have the football in it

## v0.43.2 (2026-09-07)

### Fix

- **import**: a board says what it saw, and stops where it stopped seeing

## v0.43.1 (2026-09-06)

### Fix

- **import**: a player has to be watched, not present for a share of the window

## v0.43.0 (2026-09-06)

### Feat

- **import**: pnpm board, a tracks file through the real importer

## v0.42.1 (2026-09-06)

### Fix

- **import**: a scene lands where the new holder has the ball, not mid-pass

## v0.42.0 (2026-09-06)

### Feat

- **import**: a scene is a possession change or a real movement, not a jink

## v0.41.0 (2026-09-06)

### Feat

- **import**: keep a place for the keeper and whoever takes the restart

### Fix

- **import**: the ball cannot belong to a player who is not on the pitch yet

## v0.40.0 (2026-09-04)

### Feat

- **import**: count what the board can field, and buy seconds with a fragment

## v0.39.0 (2026-09-04)

### Feat

- **import**: start the board at the set piece

## v0.38.1 (2026-09-03)

### Fix

- **import**: judge an impossible jump over a baseline, and field eleven

## v0.38.0 (2026-09-02)

### Feat

- **import**: give importing its own button and dialog

## v0.37.1 (2026-09-02)

### Perf

- **import**: ask for less coverage now the tracker gives up sooner

## v0.37.0 (2026-09-02)

### Feat

- **import**: give the ball to whoever is nearest, and let them keep it

## v0.36.0 (2026-09-02)

### Feat

- **import**: measure the runs, and stop drawing ones nobody made

## v0.35.0 (2026-09-02)

### Feat

- **import**: open tracks from the same Import tab, over the passage that was watched

## v0.34.0 (2026-09-02)

### Feat

- **import**: turn video-derived tracks into a board

## v0.33.0 (2026-09-01)

### Feat

- **boards**: projects nest, so a season's work can be filed rather than listed

## v0.32.0 (2026-08-31)

### Feat

- **editor**: the board can be worked on in 3D — players, runs and the drawing

## v0.31.0 (2026-08-31)

### Feat

- **editor**: the 3D view can be selected in, and its shapes restyled

## v0.30.0 (2026-08-31)

### Feat

- **editor**: squads that follow your account, links per scene, and players you can light up

## v0.29.0 (2026-08-31)

### Feat

- **editor**: passes you can bend and loft, and a way to present the board

## v0.28.0 (2026-08-30)

### Feat

- **editor**: no ball until it is given out, and links you can edit

## v0.27.0 (2026-08-30)

### Feat

- **editor**: edits that carry forward, per-player waits, and labels with a background

## v0.26.0 (2026-08-30)

### Feat

- **boards**: a library for saved boards, with multi-select, bulk moves and drag

## v0.25.0 (2026-08-30)

### Feat

- **draw**: resize handles you can see, and a text box that turns with the board

## v0.24.0 (2026-08-30)

### Feat

- **draw**: text labels get a box, so they wrap

## v0.23.1 (2026-08-30)

### Fix

- **ui**: refresh the board list instead of emptying it

## v0.23.0 (2026-08-30)

### Feat

- **ui**: /share/<slug>, board link first, language switch last

## v0.22.0 (2026-08-30)

### Feat

- one share dialog, and board links that follow the board

## v0.21.0 (2026-08-30)

### Feat

- boards live at /board/<id>, and sign-out resets the editor

## v0.20.1 (2026-08-30)

### Fix

- deleting a board withdraws the links published from it

## v0.20.0 (2026-08-30)

### Feat

- adopt the local board on sign-in, and publish to /s/<slug>

## v0.19.0 (2026-08-30)

### Feat

- **ui**: projects and boards panel, with server sync

## v0.18.1 (2026-08-30)

### Refactor

- move the worker back to the repository root

## v0.18.0 (2026-08-30)

### Feat

- **ui**: api client and the account menu

## v0.17.0 (2026-08-30)

### Feat

- **worker**: projects and boards crud

## v0.16.1 (2026-08-30)

### Refactor

- move the worker under infrastructure/

## v0.16.0 (2026-08-30)

### Feat

- **worker**: sign in with google

## v0.15.0 (2026-08-30)

### Feat

- **worker**: session cookie, lookup and sign-out

## v0.14.1 (2026-08-30)

### Fix

- **ci**: let pnpm run the workerd build script

## v0.14.0 (2026-08-30)

### Feat

- **worker**: add google identities and friendly share slugs

## v0.13.3 (2026-08-30)

### Fix

- **infra**: stop managing the ci api token in opentofu

## v0.13.2 (2026-08-30)

### Fix

- **infra**: grant the api token permission to manage itself

## v0.13.1 (2026-08-30)

### Fix

- **infra**: declare read_replication on the d1 database

## v0.13.0 (2026-08-30)

### Feat

- **infra**: manage the cloudflare api token and wire the real bindings

## v0.12.0 (2026-08-30)

### Feat

- **infra**: serve r2 media bucket publicly via managed r2.dev domain

## v0.11.1 (2026-08-30)

### Fix

- **build**: drop deprecated baseUrl from tsconfig.app.json

## v0.11.0 (2026-08-30)

### Feat

- **worker**: serve the spa and scaffold the api surface
- **infra**: opentofu stack for r2, d1 and kv on cloudflare

## v0.10.0 (2026-08-29)

### Feat

- 3D view, kit patterns, and English/Portuguese

## v0.9.0 (2026-08-29)

### Feat

- self-contained share links and a read-only viewer

## v0.8.0 (2026-08-29)

### Feat

- a pace per scene in seamless playback

### Fix

- clear a finished export when the settings change
- numeric fields can be cleared while typing

## v0.7.0 (2026-08-29)

### Feat

- delete every link at once
- changing formation keeps the squad and reseeds its links
- autosave the board in progress
- squad presets, saved in the browser
- export MP4, WebM, GIF and PNG

### Fix

- shot rails stop inside the arrowhead
- a shot no longer outlives the ball's travel
- refuse a shirt number already worn in the team

## v0.6.0 (2026-08-29)

### Feat

- seamless playback — one pace, no cuts between scenes

### Fix

- a player now tracks the cursor while flow is on. Flow timings are
derived from the positions, so an edit retimed the animation and left
the scrubber mid-transition, where the board draws interpolated
positions and the playback arrows. Every change re-pins the scrubber to
the selected scene, and a scene boundary now tolerates the rounding of a
seconds/milliseconds round trip.

## v0.5.0 (2026-08-29)

### Feat

- board handling — JSON, undo, a drawings rail and two resets

### Fix

- a dribble is drawn as a dribble, not as a pass. The carrier drags
the ball the length of their run, so distance could not tell the two
apart — the carrier change decides it now.

## v0.4.0 (2026-08-28)

### Feat

- every link starts as a chain
- drawing tools — arrows, lines, zones, freehand and text

## v0.3.0 (2026-08-28)

### Feat

- double-click a player to rename it
- football favicon

### Fix

- drop back to scene 1 when playback starts
- links follow their team's kit colour

## v0.2.0 (2026-08-28)

### Feat

- reset the board behind a confirmation, and use CZ_TOKEN for releases
- add and remove players from each team
- team names behind the goals, and a commitizen release workflow
- deploy to Pages, name players, per-player timing, fix half views
- board framing, team visibility and a sectioned sidebar
- live links that deform as players move
- animate scenes with curved runs, passes and playback
- static board with pure Canvas2D renderer and 27 formations

### Fix

- mirror team names, heavier links, whole link row expands
- straight passes, half views that clip, and adjustable player size
