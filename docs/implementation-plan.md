# Pitchboard — Implementation Plan

What is built and what is open. Architecture: [`architecture.md`](./architecture.md); reasoning:
[`decisions.md`](./decisions.md); traps and the definition of done: [`AGENTS.md`](../AGENTS.md).

**Sequencing, still in force:** the pure engine (`src/board/`) is built and tested before React
touches it, and every phase ends at something you can look at.

## Shipped

| Phase | What it added |
|---|---|
| M1 | Static board — pitch, two teams from 27 notation-generated formations, drag and marquee (D11) |
| M2 | Scenes, curved runs, arc-length reparameterisation, passes, playback (D1, D44) |
| M3 | Live links with distances (D47) |
| M4 | Client-side export — MP4, WebM, GIF, PNG (D6) |
| M5 | Autosave, `#d=` share links, the viewer, the migration seam (D7, D31) |
| M6 | OpenTofu stack, CI, releases, deploy (D40) |
| M7 | Drawings — arrows, zones, freehand, text (D20) |
| M8 | JSON import/export, shots, run hiding, undo (D23, D26) |
| M9 | Seamless flow at a fixed pace (D14) |
| M10 | Squad presets (D30) |
| — | Accounts, nested projects and saved boards on Worker + D1 + KV (D39); email sign-in on a custom domain (D109, D40) |
| — | Half-pitch, vertical, and an editable 3D view (D12, D34, D91) |
| — | Carry-forward editing, per-entity waits, run styles, the ball's own timing, lofts (D41, D14, D44) |
| — | Kits, patterns and keepers; EN/PT; grass and goals (D37, D38, D18) |
| — | The spotlight — highlights for players, drawings and links (D100) |
| — | Drawing outlines, corners, drawn balls, link lines and heads, snapping labels (D20, D47, D103) |
| — | Editor layout, undo notices, command palette, tour, colour picker (D93, D37) |
| — | Export shapes, captions, transparent PNGs (D6) |
| — | Video import from `football-tracks` (D52, D71, D75, D81, D87, D88) |
| — | Seven sports on one engine in board units: basketball, handball, field hockey, volleyball (D113), futsal (D117), ice hockey (D123) |
| — | The library filed by sport, built-in templates for every sport, crash screen (D114, D115) |
| — | Read-only presenting, security headers, scene-range export and sheets, File menu (D116) |
| — | Landing page at `/`, editor at `/app`, a motion system (D118, D124) |
| — | Anonymous usage counters, daily sweep, lazy pages, account zip (D119, D120) |
| — | Scene notes (D121); formations drawn by hand (D122) |
| — | Left sidebar redesign: one Selection card, view bar on the board, squad list (D125) |
| — | Visual identity and editor layout: dark grass, chalk, Archivo; scene track and Scene card (D126) |

## Open

No known defects. Non-goals are in `AGENTS.md` (D9). Pending from D126: merging Formation and
Squad preset into one line-up block.

## Testing

Vitest, engine only. Tests build a board, edit it as the editor does, and assert what the
timeline, renderer or importer produce; every trap in `AGENTS.md` has a test that fails when it
returns. The renderer is tested through a recording-proxy `ctx` that logs every call, so draw
order and geometry are asserted without a canvas polyfill or image diffing.
