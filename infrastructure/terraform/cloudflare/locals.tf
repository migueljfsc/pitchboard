locals {
  # Cloudflare has no resource tags — not on R2 buckets, D1 databases or KV namespaces
  # (the provider rejects `tags` outright). The name is therefore the only place project
  # and environment can be recorded, so every resource carries both.
  name_prefix = "${var.project_name}-${var.environment}"

  # R2 bucket holding board preview images (OG cards) and exported renders — binaries
  # that belong in neither the git repo nor a D1 row.
  media_bucket_name = "${local.name_prefix}-media"

  # D1 holds everything mutable; KV holds published snapshots (D39).
  d1_database_name   = local.name_prefix
  kv_snapshots_title = "${local.name_prefix}-snapshots"

  # Gate for domain-dependent resources (DNS + custom domains).
  has_domain     = var.domain != ""
  r2_public_fqdn = local.has_domain ? "${var.r2_public_hostname}.${var.domain}" : null
}
