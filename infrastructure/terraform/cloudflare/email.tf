# ==============================================================================
# DNS for sending email through Resend (D109) — the verification and reset
# links. Nothing here receives mail: `noreply@` has no mailbox.
#
# Mail is sent from the APP's hostname, pitchboard.<domain>, never the apex: the
# domain is shared across projects, and a subdomain keeps this project's sending
# reputation, and its SPF and DMARC, out of everyone else's way. Resend verifies
# it as a domain of its own.
#
# Resend needs two records: a DKIM key it generates when the domain is added,
# and a `send.` CNAME for bounces and SPF. The key is the one value this stack
# cannot know, so every record waits for it: add the domain in Resend choosing
# MANUAL setup (its automatic Cloudflare setup writes the same names behind this
# stack's back), copy the `resend._domainkey` value into `resend_dkim_public_key`,
# apply, then press Verify in Resend.
# ==============================================================================

locals {
  has_mail = local.has_domain && var.resend_dkim_public_key != ""
}

resource "cloudflare_dns_record" "resend_dkim" {
  count = local.has_mail ? 1 : 0

  zone_id = data.cloudflare_zone.this[0].zone_id
  name    = "resend._domainkey.${local.app_fqdn}"
  type    = "TXT"
  content = "\"${var.resend_dkim_public_key}\""
  ttl     = 1
}

# Resend's bounce and SPF domain. One CNAME into Resend's own infrastructure, so the SPF and
# bounce MX it points at are Resend's to change. A CNAME cannot share its name with any other
# record, which is why nothing else lives on `send.`.
resource "cloudflare_dns_record" "resend_send" {
  count = local.has_mail ? 1 : 0

  zone_id = data.cloudflare_zone.this[0].zone_id
  name    = "send.${local.app_fqdn}"
  type    = "CNAME"
  content = var.resend_send_target
  proxied = false
  ttl     = 1
}

# Monitoring only (`p=none`): Gmail and Yahoo require a DMARC record from any
# sender, and a policy that rejects would bounce mail the moment a record above
# drifts. Tighten once Resend has shown a clean month.
resource "cloudflare_dns_record" "dmarc" {
  count = local.has_mail ? 1 : 0

  zone_id = data.cloudflare_zone.this[0].zone_id
  name    = "_dmarc.${local.app_fqdn}"
  type    = "TXT"
  content = "\"v=DMARC1; p=none;\""
  ttl     = 1
}
