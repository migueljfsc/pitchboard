# Changelog

Notable changes to Pitchboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); SemVer once releases begin.

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
