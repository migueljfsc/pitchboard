# Changelog

Notable changes to Pitchboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); SemVer once releases begin.

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
