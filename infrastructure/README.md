# Infrastructure

Everything that provisions or runs Pitchboard on Cloudflare. Two directories, split by who
owns the thing rather than by what technology builds it.

| | owns | applied by |
|---|---|---|
| [`terraform/cloudflare/`](terraform/cloudflare/) | R2 bucket, D1 database, KV namespace — the durable resources | `.github/workflows/terraform.yml` |
| [`worker/`](worker/) | the Worker: config, source, D1 migrations | `.github/workflows/deploy-worker.yml` |

## Why the Worker is not in the OpenTofu stack

D8 said OpenTofu owns durable infra and wrangler owns the deploy. D40 records why that is a
technical fact rather than a preference, after the alternative was investigated properly:

A Worker that serves static assets is deployed in three calls — register a manifest of file
hashes, upload the bodies in buckets, then `PUT` the script referencing a **completion JWT that
Cloudflare expires after one hour**. `cloudflare_workers_script` accepts only that finished
token. Terraform cannot make the first two calls, cannot bundle the script, and cannot hold an
hour-long credential in state between a plan and an apply.

Two other things sit outside the stack for their own reasons, both in D40:

- **Secrets**, via `wrangler secret put`. A `cloudflare_workers_secret` would write them into
  the R2 state bucket, which is the failure the stack was built to avoid.
- **The CI API token**, hand-managed in the dashboard. It was a resource once; the apply
  narrowed it to exactly the groups listed, which stripped its ability to read itself, and
  every plan afterwards died at refresh. A self-managing credential can only be widened out of
  band — the apply that narrows it is the last one that can run.

## Nothing here is deployed by hand

Both directories are applied by CI on a push to `main`, both gated on the
`cloudflare-production` environment. `wrangler deploy` from a laptop is how `main` and
production drift, which is the problem `deploy-worker.yml` exists to solve.
