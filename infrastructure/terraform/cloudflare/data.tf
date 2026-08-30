# Look up the zone for the configured domain (only when a domain is set).
data "cloudflare_zone" "this" {
  count = local.has_domain ? 1 : 0

  filter = {
    name = var.domain
  }
}
