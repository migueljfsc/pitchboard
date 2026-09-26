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
  has_domain = var.domain != ""

  # The domain is personal and shared across projects, so this one claims only names under
  # or beside `pitchboard`: the app at pitchboard.<domain>, its media at pitchboard-media.
  # <domain>. The hyphen, not a dot, because Universal SSL covers one level of subdomain and
  # media.pitchboard.<domain> would need a certificate of its own.
  app_fqdn       = local.has_domain ? "${var.project_name}.${var.domain}" : null
  r2_public_fqdn = local.has_domain ? "${var.project_name}-${var.r2_public_hostname}.${var.domain}" : null

  # Every hostname the sign-in form is served from. workers.dev stays in until it is
  # switched off, or registering there fails the bot check.
  turnstile_domains = compact(concat([local.app_fqdn], var.turnstile_extra_domains))
}
