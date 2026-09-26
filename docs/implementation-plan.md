# Pitchboard — Implementation Plan

What has been built, and what is left. Architecture is in [`architecture.md`](./architecture.md),
the reasoning in [`decisions.md`](./decisions.md), the traps in [`AGENTS.md`](../AGENTS.md).

**Sequencing principle, still in force:** the pure engine (`src/board/`) is built and tested
before any React touches it, and every phase ends at a state you can look at.

---

## Shipped

| Phase | What it added |
|---|---|
| M1 | Static board — pitch, two teams from 27 notation-generated formations, drag and marquee (D11) |
| M2 | Scenes, curved runs, arc-length reparameterisation, passes, playback (D1, D44) |
| M3 | Links — live connectors recomputed every frame, with distances (D47) |
| M4 | Export — MP4, WebM, GIF, PNG, all client-side (D6) |
| M5 | Autosave, `#d=` share links, the read-only viewer, the migration seam (D7, D31) |
| M6 | OpenTofu stack, CI, release workflow, deploy (D40) |
| M7 | Drawings — arrows, zones, freehand, text labels (D20) |
| M8 | JSON import/export, shots, run hiding, undo (D23, D26) |
| M9 | Seamless flow at a fixed pace (D14) |
| M10 | Squad presets (D30) |
| — | Accounts, nested projects and saved boards on a Worker + D1 + KV (D39) |
| — | Framing: half-pitch, vertical, and the 3D view, which edits everything the flat board does (D12, D34, D91) |
| — | Carry-forward editing, per-entity waits, run styles, the ball's own timing, lofts (D41, D14, D44) |
| — | Kits with patterns and keepers, EN/PT, the grass and goals (D37, D38, D18) |
| — | The spotlight — highlights for players, drawings and links, and drawings kept out of the dark (D100) |
| — | Drawing: outlines, corners, drawn balls, link lines and heads, labels that snap and measure (D20, D47, D103) |
| — | Editor layout, undo notices, the command palette, the tour, the colour picker (D93, D37) |
| — | Export shapes, captions and transparent PNGs (D6) |
| — | Video import from the `football-tracks` sibling repo (D52, D71, D75, D81, D87, D88) |

## Open

- **Save the current shape as a custom formation.** The last item from M1. Formations are
  generated from notation (D11), so this needs somewhere to keep one that is not.
- **Custom domain.** Stubbed behind a `has_domain` flag; the app runs on `*.workers.dev`.
- Known defects are in [`bugs.md`](./bugs.md). Non-goals are in `AGENTS.md` (D9).

## Definition of done, per change

- resize the window and confirm players do not move relative to the pitch — a pixel value
  reaching the document is the most likely bug in the project, and this is how it shows
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

## Testing

Vitest, engine only, no component tests. Tests exercise behaviour through the engine's public
operations — build a board, edit it the way the editor does, and assert what the timeline, the
renderer or the importer produce — and every known trap in `AGENTS.md` has a test that fails when
it is reintroduced. The renderer is tested through a recording-proxy `ctx` that logs every call,
so draw order and geometry are asserted without a canvas polyfill or image diffing.
