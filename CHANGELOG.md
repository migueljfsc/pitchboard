# Changelog

Notable changes to Pitchboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); SemVer once releases begin.

## [Unreleased]

### Added

- Project documentation: architecture, phased implementation plan, and decision log
  under [`docs/`](./docs).
- Repository scaffolding — commitizen, pre-commit, dependabot, conventional-commit CI.
- **M1 — static board.** Vite + React + Tailwind scaffold; the `BoardDoc` schema with zod
  validation; a pitch renderer at real IFAB dimensions; the metre-based coordinate system;
  six formation presets that seed their own links; and drag, multi-select, marquee and
  line-nudge editing. 67 engine tests, including a renderer suite that runs against a
  recording proxy context rather than a canvas polyfill.
- **27 formation presets**, matching the eleven-a-side catalogue offered by
  lineup-builder.co.uk, grouped in the picker by back-line shape. Presets are generated
  from their notation rather than hand-authored — `"4-2-3-1"` yields lines of 4, 2, 3 and 1
  with depth, width, shirt numbers and seeded links all derived.
- **M2 — animation.** A timeline of scenes with per-scene travel and hold durations, playback
  with looping, and a scrubber. Runs curve along editable bezier paths, travelled at constant
  speed via arc-length reparameterisation. The ball attaches to a carrier and a pass is simply a
  carrier change, tracking a receiver who is still running. Scene add, duplicate, reorder,
  rename and delete. 134 engine tests.
- **M3 — links.** A connector between a group of players, recomputed every frame from their
  interpolated positions so the shape deforms as they move independently — a midfield three
  visibly stretches when one of them jumps to press. Chain, shape or filled per link, with
  optional live edge distances in metres. Create from a selection, rename, recolour, reorder
  members, hide, delete; formation presets seed their own. 165 engine tests.
- **Board framing and sidebar.** Free-text team names; per-team visibility so one side can be
  drawn alone; a half-pitch view (left / full / right) for attacking or defensive analysis; and
  a vertical board with the attacking direction up the screen, text staying upright. The sidebar
  is now collapsible sections with badges. 180 engine tests.
