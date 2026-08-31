# Pitchboard — Implementation Plan

What has been built, and what is left. Architecture detail lives in
[`architecture.md`](./architecture.md); the reasoning behind the choices lives in
[`decisions.md`](./decisions.md); the traps that survive the build live in
[`AGENTS.md`](../AGENTS.md).

**Sequencing principle, still in force:** the pure engine (`src/board/`) is built and tested
before any React touches it, and every phase ends at a state you can look at.

---

## Shipped

| Phase | What it added |
|---|---|
| M1 | Static board — pitch, two teams from 27 notation-generated formations, drag and marquee |
| M2 | Scenes, curved runs, arc-length reparameterisation, passes, playback |
| M3 | Links — live connectors recomputed every frame, with distances |
| M4 | Export — MP4, WebM, GIF, PNG, all client-side |
| M5 | Autosave, `#d=` share links, the read-only viewer, the migration seam |
| M6 | OpenTofu stack, CI, release workflow, deploy |
| M7 | Annotations — arrows, zones, freehand, text labels with boxes and backgrounds |
| M8 | Board handling — JSON import/export, shots, per-scene run hiding, undo |
| M9 | Seamless flow — one continuous movement at a fixed pace |
| M10 | Squad presets and autosave |
| — | Accounts, projects and saved boards on a Worker + D1 + KV (D39) |
| — | The 3D view (D34), half-pitch and vertical framing, kit patterns, EN/PT (D38) |
| — | Carry-forward editing (D41), per-entity waits (D42), ball handover (D43, D44) |
| — | Squad presets follow the account rather than the browser (D46) |
| — | Links with a scene range, and per-scene player highlights (D47) |

Everything above is complete and covered by tests. The per-phase task lists and build notes were
retired once they stopped describing anything a reader has to decide; what outlived them is in
`AGENTS.md` under **Known traps**.

## Open

- **Save the current shape as a custom formation.** The last item from M1 never built. Formations
  are generated from notation (D11), so this needs somewhere to keep one that is not.
- **Custom domain.** Stubbed behind a `has_domain` flag; the app runs on `*.workers.dev`.

## Definition of done, per change

Two checks belong to every change, whatever it touches:

- resize the window and confirm players do not move relative to the pitch
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean

The resize check is not ceremony: a pixel value reaching the document is the most likely bug in
the project, and drifting-on-resize is how it shows.

## Testing

Vitest, pure engine only, no component tests. The engine is numerical code where tests are cheap
and load-bearing.

| Target | Coverage |
|---|---|
| `geometry` | bezier evaluation, arc-length LUT accuracy, constant-speed reparameterisation |
| `timeline` | scene boundaries, `t=0`, `t=end`, holds, waits, flow pacing, single-scene docs |
| `ball` | every carrier case, pass timing, moving-target passes, glued offset, no ball at all |
| `links` | chain vs polygon vertex order, distances against known coordinates |
| `schema` | round-trip, invariant violations, oversized and malformed payloads |
| `render` | a recording-proxy `ctx` that logs every call; the command log is the assertion |

The recording proxy is the interesting one: it tests the renderer with no canvas polyfill and no
image diffing, and it catches draw-order regressions cleanly.

## Out of scope for v1

- **Real player data** — a licensing problem, not an availability one (D9)
- Cones and other pitch furniture
- Five- and seven-a-side (D10)
- Thirds and final-third crops — half-pitch shipped, thirds did not
- Touch support
- Heatmaps and average-position overlays
