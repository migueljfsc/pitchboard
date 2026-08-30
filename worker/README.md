# The Worker

Serves the SPA and the `/api/*` surface at
https://pitchboard.migueljfscardoso.workers.dev.

`wrangler.jsonc` sits at the repository root, beside `package.json` — it is the project's
deploy config, and its paths resolve against itself.

```
index.ts           the router — /api/* only
lib/
  session.ts       the cookie, the row it points at, lazy expiry, sliding renewal
  google.ts        OAuth: authorize URL, PKCE, code exchange, claim validation
  users.ts         external identity to account, link rather than duplicate
  boards.ts        projects and boards; ownership is a WHERE clause, never a check
  shares.ts        publishing to /s/<slug>, and the one public read
  limits.ts        per-user quotas — D39 wanted them shipping with the feature
  crypto.ts        ids, session tokens, SHA-256 — no password KDF lives here
  http.ts          JSON responses, all no-store
secrets.d.ts       the secrets wrangler.jsonc cannot hold, merged into Env
migrations/        D1 schema, forward-only
```

## What costs what

The free tier refuses work rather than billing, so the limits are the design constraints:

- **10 ms CPU per request.** Waiting on D1, KV or `fetch` does *not* count — only compute
  does. This is why sessions are a D1 lookup rather than a third-party cache, and why Google
  sign-in is cheap while a password KDF is the one expensive thing in the codebase.
- **100,000 requests/day.** Asset requests are free and unlimited and do not count, which is
  why `run_worker_first` is an array of patterns and not `true`.
- **D1: 5M row reads, 100k row writes per day.** Session renewal slides only once a session
  has lost more than a day of life, which caps it at one write per session per day.
- **KV: 100k reads but only 1,000 writes per day.** Writes are the scarce thing, so KV holds
  published snapshots — written once, then only read — and never per-request state. A publish
  is one write; the OAuth state that could have gone there is a cookie for exactly this reason.

## Bindings

Declared in `wrangler.jsonc` and nowhere else. `pnpm types` regenerates
`worker-configuration.d.ts` from it, which is gitignored (570 KB, and derived) and rebuilt
ahead of both `pnpm typecheck` and `pnpm build`. Adding a binding means editing
`wrangler.jsonc`; there is no second place to keep in sync.

Ids come from `tofu output` after the stack's first apply. They are identifiers, not secrets.

## Secrets

Not in `wrangler.jsonc`, not in OpenTofu, not in state:

```sh
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

They survive a deploy, so this is a one-time step. Their types live in `secrets.d.ts`, which
is the one hand-written part of `Env` — wrangler reads secret types from `.dev.vars`, and that
file is gitignored, so CI would regenerate an `Env` without them and fail a correct typecheck.

## Migrations

Forward-only, applied by CI before the script is deployed so a new version never meets a table
it predates. `0002` drops and rebuilds two tables, which was safe only because they were empty
and is stated loudly in its header; from `0003` onward they must be additive.

```sh
wrangler d1 migrations apply pitchboard-prod --remote
```

## Deploying

CI, on a push to `main` touching this directory or the app it serves. Locally, only ever as a
dry run:

```sh
PITCHBOARD_BASE=/ pnpm build && pnpm deploy:worker --dry-run
```

`PITCHBOARD_BASE=/` matters: the default build targets the `/pitchboard/` base path that
GitHub Pages serves from, and the Worker serves from the root.

## The two share links

They do not meet, and that is deliberate.

| | anonymous | account |
|---|---|---|
| address | `#d=<deflated board>` | `/s/<slug>` |
| where the board lives | in the URL | KV, behind a snapshot row |
| does the server see it | **no** — browsers never send a fragment | yes |
| changes when republished | there is nothing to republish | yes, the slug re-aims |
| works on GitHub Pages | yes | no, and cannot |

The anonymous one predates accounts and is untouched by any of this (D33). The account one
exists because a link you can read down a phone is worth having, and it publishes an immutable
snapshot while keeping the slug stable — so sending the link again is never necessary (D39).

`GET /api/shares/:slug` is the only route in the Worker that answers without a session. It
returns the published document and the board's name, and nothing about who published it.
