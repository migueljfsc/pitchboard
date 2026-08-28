# Pitchboard — Decision Log

Why the design is what it is, and what was rejected. Each entry records the alternative not
taken, because that is the part that gets re-litigated later.

---

## D1 — Animation model: scenes with per-transition paths

**Decision.** A timeline of scenes. Within a transition, an arrow drawn on a player defines the
curve it travels to its next-scene position; players without an arrow tween in a straight line.

**Rejected — pure keyframes.** Straight-line tweens only, arrows purely decorative. Simplest to
build, but curved and overlapping runs are the entire point of a tactical diagram. A winger
cutting inside and an overlapping full-back are both straight lines in this model, which is
wrong.

**Rejected — pure path-based.** No scenes; every player gets a path with a start delay and
duration, and the timeline is a Gantt of overlapping animations. Maximum expressiveness, but
authoring is much harder and there is no cheap answer to "what does the shape look like at
t=3s" — which is exactly the question a tactics board exists to answer.

The hybrid keeps the scene as the unit of thought while allowing real curved movement between
scenes.

---

## D2 — Renderer: pure Canvas2D, no library

**Decision.** One `drawBoard(ctx, doc, t, view)` function, plain Canvas2D, no DOM or React
dependency. Hand-rolled hit-testing.

**Rejected — Konva / react-konva.** Built-in drag, events, and transform handles would save
roughly 350 lines of interaction code. But export means driving a second offscreen Stage, and
the scene graph sits between the code and the pixels — which is precisely where preview/export
divergence comes from. Trading a guarantee for a few hundred lines is a bad trade when the
guarantee is the product's core quality bar.

**Rejected — React-rendered SVG.** Best developer experience, native DOM events, crisp at any
zoom. But every export frame requires serialising SVG to an image and decoding it, which is slow
and fragile — fonts and CSS must be fully inlined, and it is the usual source of "the export
looks wrong".

With a pure function, export runs in a Web Worker on an `OffscreenCanvas`, faster than realtime,
and preview/export divergence is structurally impossible rather than a bug class to test for.

---

## D3 — Coordinates in pitch metres, never pixels

**Decision.** All document coordinates are metres on a 105 × 68 pitch.

**Rejected — pixels or normalised 0–1.** Both require a conversion wherever distances matter,
and both make export resolution a pervasive concern instead of a single scale factor.

Metres give resolution independence, one-line export scaling, and link distance metrics for
free. The cost is the discipline of never letting a pixel value into the document, which the
window-resize check in every phase's DoD is designed to catch.

---

## D4 — A pass is a carrier change

**Decision.** `scene.carrier` names the player holding the ball. The ball's position is derived,
not stored, while carried. Changing the carrier between scenes *is* a pass.

**Rejected — the ball as an ordinary entity** with its own positions and paths in every scene.
Simpler schema, but every carry becomes manual keyframing of the ball alongside the player, and
the two drift apart the moment the player's path is edited.

**Rejected — a separate pass object type** with source, target, and timing. More explicit, but it
duplicates the timing model already in the scene and adds a second thing to keep in sync.

The carrier field is one nullable string and covers carry, pass, loose ball, and collection. Two
details make it work: passes use `easeOutQuad` rather than the players' `easeInOutCubic`, and
pass endpoints are evaluated from interpolated positions so the ball leads a moving receiver.

---

## D5 — Links are live connectors, not decorations

**Decision.** A link is a first-class entity — an ordered member list plus a style — recomputed
every frame from members' interpolated positions.

**Rejected — static shapes drawn per scene.** Would make the connector a drawing that must be
redrawn each scene, and it would not deform during a transition. The entire value is watching
the shape distort while players move independently: the back 4 breaking as one defender steps
out, the midfield triangle stretching under a press.

Per-link style rather than a single global style, because a back 4 needs an open chain (a closing
edge across the pitch is obviously wrong) while a midfield 3 needs a closed triangle and a press
trap wants a translucent fill.

---

## D6 — Export: mediabunny, with GIF first-class

**Decision.** `mediabunny` for MP4 (H.264) and WebM (VP9); `gifenc` for GIF. Format chosen at
runtime by capability check, never user-agent sniffing.

**Rejected — `mp4-muxer` / `webm-muxer`.** The obvious choice, and deprecated. Both were
superseded by mediabunny, which covers muxing for both containers plus WebCodecs abstraction in
one zero-dependency tree-shakable package.

**Rejected — `MediaRecorder`.** Captures in realtime, which drops frames under load and ties
export duration to animation duration. Offline encoding is both faster and more reliable.

**Rejected — server-side render** (headless Chromium + ffmpeg). Perfect compatibility, but needs
an always-on container with CPU budget, which contradicts the free-tier constraint in the
portfolio's `CLAUDE.md`, and adds a job queue.

GIF is a first-class option rather than a fallback because it is the format that actually pastes
into a group chat. It requires a palette built once from the board's known colours — per-frame
quantisation makes the pitch greens shimmer.

---

## D7 — Immutable share snapshots, no accounts

**Decision.** Publishing mints a new id; opening a link gives you a fork. Three layers: local
autosave, self-contained `#d=` compressed URL, and KV for anything larger.

**Rejected — accounts with a saved-board library.** The better product, and a large scope
increase: auth, per-user storage, quotas, account deletion. Wrong shape for a portfolio piece.

**Rejected — local-only with file import/export.** Zero backend and zero abuse surface, but
nothing is shareable except a file, which kills the main use case.

**Rejected — mutable boards with edit keys.** Requires an authorisation model. Immutability
removes the question entirely, and matches what sharing a tactic means: you are sending a
position, not granting write access.

The `#d=` layer is worth the ~20 lines because `CompressionStream` is native: small boards then
work with no backend at all and survive the API being down.

---

## D8 — Cloudflare Worker + KV, OpenTofu-provisioned

**Decision.** A single Worker serves the static SPA and the `/api/boards` endpoints, with KV
holding board JSON. OpenTofu provisions the KV namespace; `wrangler` deploys the code.

**Rejected — GitHub Pages with URL-encoded state only.** Matches the two Astro projects exactly
and costs nothing, but URLs run long and complex animations exceed what chat apps and browsers
handle. Kept as the `#d=` layer rather than the whole answer.

**Rejected — GitHub Pages plus a separate Worker for links.** Splits one app across two hosts and
two pipelines, and adds CORS for no benefit.

**Rejected — container with a Go API,** reusing the `wtc` stack. Most consistent with the largest
project here and the strongest DevOps showcase, but it needs a paid always-on host.

**On the ownership split:** OpenTofu deliberately does not manage `cloudflare_workers_script`.
Terraform owning the script fights the Vite build for control of the artefact. Infra that
outlives a deploy belongs in OpenTofu; the deploy belongs to wrangler. The cost is one manual
step — pasting the KV namespace id into `wrangler.jsonc` after the first apply.

Free tier: 100k Worker requests/day, 100k KV reads/day, **1k KV writes/day**. Writes are the
binding constraint, so the rate-limiting binding goes on `POST`.

---

## D9 — Real player data deferred to v2

**Decision.** v1 ships custom players only. No real-squad autocomplete.

The original ask was a combobox of real players after three characters. The blocker is not
availability, it is licensing, and it is worth recording properly:

| Source | Problem |
|---|---|
| API-Football | 100 req/day free; terms restrict bulk caching and redistribution |
| football-data.org | 12 competitions free forever, 10 req/min, but squad data is a paid endpoint |
| TheSportsDB | Free tier is non-commercial only; artwork requires attribution and has mixed licensing |
| Sportmonks and similar | Paid from the start |
| **Wikidata** | **CC0, genuinely unrestricted.** `P106=Q937857` for footballers, `P54` for club. Freshness is patchy in lower leagues and transfer windows lag |

A per-keystroke autocomplete cannot call any of these directly — the free quotas die instantly
and the latency is poor. It requires seeding a local database and serving search from it, which
is exactly what the commercial terms forbid. Wikidata is the only source where that is clean.

**Player photos are a separate and harder problem** and are out of scope regardless of source:
redistribution rights rarely come with the data, and they would bloat the MP4 export.

Deferring keeps the whole data pipeline, seeding cron, and licensing question off the critical
path for a board that has to be good on its own first. When it returns: bulk SPARQL pull from
Wikidata into KV or D1, refreshed weekly, autocomplete served from our own store, tokens showing
number and surname only.

---

## D10 — Stack follows `wtc/ui`, with pnpm

**Decision.** React 19.2 + TS 5.6 strict + Vite 8 + Tailwind v4 + shadcn-style primitives,
matching `wtc/ui/`. pnpm rather than npm.

`wtc/ui` is the established React pattern in this portfolio and its ESLint config, Tailwind
setup, and `components/ui/` primitives are directly reusable. It uses npm, but the two Astro
projects and the portfolio default are pnpm, so pnpm wins on portfolio consistency.

**Vitest is new here.** There are currently zero JS/TS tests across the portfolio. The engine —
arc-length reparameterisation, timeline resolution, the ball carrier matrix — is pure numerical
code where tests are cheap and genuinely load-bearing. Component tests remain out of scope.

---

## Invariants

Two rules a future change is most likely to break. Both belong in `AGENTS.md`.

1. **`drawBoard` is pure.** No DOM, no React, no `Date.now()`, no `Math.random()`. If a value is
   needed, it goes in `BoardDoc` or `Viewport`. Breaking this breaks export fidelity, and the
   symptom appears far from the cause.
2. **No pixels in the document.** All coordinates are pitch metres. Breaking this shows up as
   players drifting on window resize or on a retina display.
