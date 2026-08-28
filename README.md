# Pitchboard

[![ci](https://github.com/migueljfsc/pitchboard/actions/workflows/ci.yml/badge.svg)](https://github.com/migueljfsc/pitchboard/actions/workflows/ci.yml)
[![deploy](https://github.com/migueljfsc/pitchboard/actions/workflows/deploy.yml/badge.svg)](https://github.com/migueljfsc/pitchboard/actions/workflows/deploy.yml)

An animated football tactics board that runs in the browser. Draw a formation, move players
between scenes along curved runs, and export the result as **MP4**, **GIF**, or **PNG** —
all client-side, no server rendering.

**Live:** https://migueljfsc.github.io/pitchboard/ — published by
[`deploy.yml`](.github/workflows/deploy.yml) on every push to `main`.

> Releases are cut by [`release.yml`](.github/workflows/release.yml): commitizen bumps the
> version from conventional commits, updates the changelog, tags, and opens a GitHub Release.
> It needs a `CZ_TOKEN` secret, because `main` is protected and the built-in `GITHUB_TOKEN`
> cannot push to a protected branch.

> **Status: in progress.** The board, animation and links are built (M1–M3). Export to MP4 /
> GIF / PNG is next. See [`docs/implementation-plan.md`](docs/implementation-plan.md) for the
> plan and [`docs/bugs.md`](docs/bugs.md) for known defects.

## What makes it different

**Live links.** Select the back 4 or the midfield 3 and draw a connector between them. The
connector is recomputed every frame from the players' interpolated positions, so it deforms as
they move independently — you watch the unit stretch when the left 8 jumps to press, and see
the gap open behind them. Existing tactics boards treat group shapes as static decoration.

Chain, polygon, or filled per link, with optional live distance labels in metres.

## Design

| Piece | Approach |
|---|---|
| **Animation** | Timeline of scenes. An arrow drawn on a player defines the curve it travels to its next-scene position; no arrow means a straight tween. |
| **Renderer** | One pure `drawBoard(ctx, doc, t, view)` — plain Canvas2D, no DOM or React. The editor draws it to a visible canvas; the exporter draws the same function to an `OffscreenCanvas` in a Web Worker. Preview and export cannot diverge. |
| **Coordinates** | Pitch metres (105 × 68), never pixels. Resolution-independent rendering, and link distances come for free. |
| **Ball** | Attaches to a carrying player. A pass is a *carrier change*, not a separate object. |
| **Export** | `mediabunny` for MP4 (H.264) and WebM (VP9), `gifenc` for GIF. Format chosen by runtime capability check. |
| **Sharing** | Immutable snapshots. Small boards fit in a compressed URL fragment with no backend; larger ones go to Cloudflare KV. |

Full detail in [`docs/architecture.md`](docs/architecture.md); the reasoning and the rejected
alternatives are in [`docs/decisions.md`](docs/decisions.md).

## Stack

React 19 + TypeScript (strict) + Vite 8 + Tailwind v4. Deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`, behind the same lint / typecheck / test
/ build gates CI runs.

Pages is static, so share links will use the self-contained compressed-URL form. A backend for
larger boards (Cloudflare Worker + KV) remains an option for M5 — see
[`docs/decisions.md`](docs/decisions.md).

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # vitest — engine only
pnpm lint
pnpm typecheck
pnpm build        # base path /pitchboard/ for GitHub Pages
```

Node >= 22.12. Package manager: pnpm.

`base` is only applied to production builds, so `pnpm dev` stays at the root. Override it with
`PITCHBOARD_BASE=/ pnpm build` for a root-domain deploy.

### Contributing to yourself later

```bash
pre-commit install        # commit-msg + pre-commit hooks
cz commit                 # guided conventional commit
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); CI rejects
anything else on a PR.

## Documentation

| Document | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Renderer contract, coordinate system, `BoardDoc` schema, timeline and ball model, links, export pipeline, sharing |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Phases M0–M6 with tasks, definition of done, and per-phase risks |
| [`docs/decisions.md`](docs/decisions.md) | Decision log — what was chosen, and what was rejected |
| [`docs/bugs.md`](docs/bugs.md) | Known defects, with the cause where it is understood |
| [`AGENTS.md`](AGENTS.md) | Working conventions and the invariants that must not be broken |

## Licence

[MIT](LICENSE).
