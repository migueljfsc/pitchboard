# Cloudflare infrastructure

OpenTofu for Pitchboard's Cloudflare resources. Single stack, files split by concern (mirrors
the layout in `motorcycle-journey/infrastructure/terraform/cloudflare`).

Per D8, **OpenTofu owns durable infra and wrangler owns the deploy**. There is deliberately no
`cloudflare_workers_script` here, and there will not be one: the Worker is deployed by wrangler,
and the bindings it needs are created here and passed through as outputs.

## What it manages

| File | Resource | Status |
|------|----------|--------|
| `r2.tf` | R2 media bucket (+ CORS, + public r2.dev domain, + custom domain) | **active** (bucket, CORS, public access); custom domain gated on `domain` |
| `d1.tf` | D1 database — users, sessions, projects, boards | **active** |
| `kv.tf` | KV namespace — published board snapshots | **active** |
| `data.tf` | Zone lookup | gated on `domain` |

The R2 bucket holds board preview images (OG cards for share links) and exported renders —
binaries that belong in neither the git repo nor a D1 row. D1 and KV are the two halves of the
data model in D39: D1 for everything mutable, KV for snapshots that are written once and then
only read.

## Naming, and the absence of tags

Cloudflare has no resource tags. `tags` is rejected outright by the provider on
`cloudflare_r2_bucket`, `cloudflare_d1_database` and `cloudflare_workers_kv_namespace` — the only
`tags` argument in the provider is on `cloudflare_workers_script`, which this stack deliberately
does not manage. There is also nothing to allocate cost against: one account, one bill, and a free
tier that refuses work rather than billing for it.

So the name is the only metadata that survives, and `local.name_prefix` puts the project and the
environment into every one of them — `pitchboard-prod`, `pitchboard-prod-media`,
`pitchboard-prod-snapshots`. Renaming after an apply destroys and recreates, so the prefix is
worth settling before the first one.

## Prerequisites

1. **API token** (provider auth) — create at Cloudflare → My Profile → API Tokens with:
   - Account · Workers R2 Storage · Edit
   - Account · D1 · Edit
   - Account · Workers KV Storage · Edit
   - Zone · DNS · Edit and Zone · Zone · Read (only needed once `domain` is set)
   ```sh
   export CLOUDFLARE_API_TOKEN=...        # provider auth
   ```
2. **Account ID** — kept out of the repo. Provide it at run time:
   ```sh
   export TF_VAR_cloudflare_account_id=...
   ```

## State backend

State lives in the R2 bucket `terraform-tfstate`, **shared across all personal projects** — each
stack is isolated by its state `key` (here `pitchboard/cloudflare/...`). The bucket and its R2
access key were bootstrapped by hand for `motorcycle-journey`; reuse them rather than creating a
second bucket.

Bucket, key, region and the R2-specific skip flags are pinned in `backend.tf`, so there is no
local backend file to create. The only account-specific value is the endpoint, and it comes from
the environment:

```sh
export AWS_ENDPOINT_URL_S3="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID=<r2-access-key-id>
export AWS_SECRET_ACCESS_KEY=<r2-secret>
```

If the bucket does not exist yet: Dashboard → R2 → create bucket `terraform-tfstate` (private;
enable Object versioning to recover from bad state), then R2 → Manage API Tokens → create an
R2 token with Object Read & Write.

## Usage

Normally you do not run this by hand — `.github/workflows/terraform.yml` plans on pull requests
and applies on merge to `main`. Locally:

```sh
export TF_VAR_cloudflare_account_id=...
tofu init
tofu plan  -var-file=contexts/prod.tfvars
tofu apply -var-file=contexts/prod.tfvars
```

`tofu init -backend=false` skips state entirely for a quick `validate`.

## Uploading to the bucket

Use rclone or the AWS CLI against the S3-compatible endpoint (see the `r2_s3_endpoint` output)
with the same R2 token used for state.

The bucket is **public**: `cloudflare_r2_managed_domain` serves it over Cloudflare's managed
`r2.dev` subdomain, and `tofu output r2_public_url` gives the base URL to read objects back from.
Two consequences worth holding onto:

- Every object is world-readable to anyone with the URL. R2 has no per-object ACLs, so nothing
  user-private can be written to this bucket.
- `r2.dev` is rate-limited and bandwidth-throttled, and Cloudflare states it is not intended for
  production. It is fine for preview images on a portfolio piece; a custom domain is the fix if
  that ever stops being true.

## Cost

Everything in this stack sits inside a free tier that Cloudflare enforces by **refusing
requests, not by billing** — R2 gives 10 GB-month, 1M class-A and 10M class-B operations per
month, with no egress charge. The stack stays at $0 as long as `domain` is empty; a registered
domain is the only line item that would ever cost anything.
