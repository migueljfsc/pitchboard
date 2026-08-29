# Changelog

Notable changes to Pitchboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); SemVer once releases begin.

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
