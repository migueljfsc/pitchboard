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
