# Pitchboard

[![ci](https://github.com/migueljfsc/pitchboard/actions/workflows/ci.yml/badge.svg)](https://github.com/migueljfsc/pitchboard/actions/workflows/ci.yml)
[![deploy](https://github.com/migueljfsc/pitchboard/actions/workflows/deploy-worker.yml/badge.svg)](https://github.com/migueljfsc/pitchboard/actions/workflows/deploy-worker.yml)

An animated tactics board in the browser — football, futsal, basketball, handball, field hockey,
ice hockey and volleyball on one engine. Draw a formation, move players between scenes along curved
runs, export **MP4**, **GIF** or **PNG** — all client-side.

**Live:** https://pitchboard.migueljfsc.dev — one Cloudflare Worker serving the app and its API,
deployed by [`deploy-worker.yml`](.github/workflows/deploy-worker.yml) on every push to `main`.
[`release.yml`](.github/workflows/release.yml) cuts releases with commitizen; it needs a
`CZ_TOKEN` secret because `main` is protected.

## What makes it different

**Live links.** Connect the back 4 or the midfield 3 and the connector is recomputed every frame
from the players' interpolated positions, so it deforms as they move — the unit stretches when
the 8 jumps to press, and the gap opens behind him. Other boards treat group shapes as static.
Chain, polygon or filled, with optional live distances in metres.

## Design

| Piece | Approach |
|---|---|
| **Animation** | Scenes on a timeline. An arrow on a player is the curve he runs to his next position; none is a straight tween. A player can take longer than the scene, or wait, so one scene can hold a sequence. |
| **Renderer** | One pure `drawBoard(ctx, doc, t, view)` on plain Canvas2D. The editor, the export Web Worker and the scene previews all call it, so preview and export cannot diverge. |
| **Coordinates** | Board units, never pixels: metres on a football pitch, every other court scaled to the same length and converted back to metres wherever a distance is read. |
| **Sports** | Each sport is a spec — court, goal, keeper, snaps — plus its court drawer. Nothing branches on a sport's name. |
| **Ball** | Attached to a carrier. A pass is a *carrier change*, not an object. |
| **Editing** | A move carries forward through later scenes the player was not already running into. |
| **Drawing** | Arrows, lines, freehand, zones and text, each over a range of scenes. |
| **Views** | Full pitch or a half, horizontal or vertical, flat or through one angled camera. |
| **Export** | `mediabunny` for MP4 (H.264) / WebM (VP9), `gifenc` for GIF, chosen by capability check; size follows the board's aspect. |
| **Sharing** | A frozen board in a compressed URL fragment, no backend; or, from an account, a short link that follows its edits. |
| **Import** | A `tracks.json` from the sibling [`football-tracks`](../football-tracks) (broadcast clip → positions) becomes a board to correct. |
| **Storage** | Signed out, `localStorage`, validated on read and discarded rather than repaired. Signed in, boards in nested projects under one root per sport. |

## Stack

React 19, TypeScript (strict), Vite 8, Tailwind v4. The Worker in [`worker/`](worker/) serves the
app, `/api/*` and share pages. OpenTofu in
[`infrastructure/terraform/cloudflare`](infrastructure/terraform/cloudflare) owns R2, D1, KV,
Turnstile and DNS, and deliberately not the deploy (D40).

## Develop

```bash
pnpm install
pnpm dev                   # http://localhost:5173
pnpm test                  # vitest, engine only
pnpm lint && pnpm typecheck && pnpm build
pnpm board <tracks.json>   # a football-tracks file through the real importer
pre-commit install         # hooks; commits are Conventional (`cz commit`), enforced in CI
```

Node >= 22.12, pnpm.

## Documentation

| Document | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Renderer contract, coordinates, schema, timeline, ball, links, export, sharing, API |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | What is built, what is open, how it is tested |
| [`docs/decisions.md`](docs/decisions.md) | Why the design is what it is |
| [`AGENTS.md`](AGENTS.md) | Conventions and the invariants that must not break |

## Licence

[MIT](LICENSE).
