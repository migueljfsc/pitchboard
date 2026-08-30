# ==============================================================================
# R2 object storage — board preview images and exported renders.
#
# Export itself stays client-side (see the mission in AGENTS.md); this bucket is for
# artefacts the app chooses to publish, not for a server-side render pipeline.
# ==============================================================================

resource "cloudflare_r2_bucket" "media" {
  account_id    = var.cloudflare_account_id
  name          = local.media_bucket_name
  location      = var.r2_location
  storage_class = var.r2_storage_class
}

# Public read access over Cloudflare's managed r2.dev subdomain. This is the only way to
# serve objects publicly while `domain` is empty, so it is what "publicly available" means
# here today. Two things it is not: Cloudflare rate-limits r2.dev (429s under load) and
# throttles its bandwidth, and states outright that it is not intended for production. Once
# a domain exists, serve from cloudflare_r2_custom_domain below and revisit this.
#
# SECURITY: this makes every object in the bucket world-readable to anyone with the URL.
# R2 has no per-object ACLs, so the bucket is public or it is not — nothing user-private
# may be written here. The intended contents are board preview images and exported renders,
# which are published artefacts by definition.
resource "cloudflare_r2_managed_domain" "media" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name
  enabled     = true
}

# Public access via a custom domain (media.<domain>). Created only when a domain is set.
resource "cloudflare_r2_custom_domain" "media" {
  count = local.has_domain ? 1 : 0

  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name
  domain      = local.r2_public_fqdn
  zone_id     = data.cloudflare_zone.this[0].zone_id
  enabled     = true
}

# CORS so the assets can be requested from the site origin (and previews).
resource "cloudflare_r2_bucket_cors" "media" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name

  rules = [{
    allowed = {
      methods = ["GET", "HEAD"]
      origins = ["*"]
    }
    max_age_seconds = 3600
  }]
}
