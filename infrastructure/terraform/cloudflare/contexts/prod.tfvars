environment = "prod"

# cloudflare_account_id is NOT set here (kept out of the repo). Provide it via:
#   - local: `export TF_VAR_cloudflare_account_id=...` or a gitignored *.auto.tfvars
#   - CI:    the CLOUDFLARE_ACCOUNT_ID secret, exported as TF_VAR_cloudflare_account_id
# The API token comes from the CLOUDFLARE_API_TOKEN env var.

# ---- R2 ----
r2_location = "WEUR" # Western Europe

# ---- Custom domain ----
# Personal, bought through Cloudflare Registrar and shared across projects (D109). This stack
# owns only pitchboard.migueljfsc.dev and pitchboard-media.migueljfsc.dev.
domain = "migueljfsc.dev"

# ---- Email (Resend) ----
# Add pitchboard.migueljfsc.dev in Resend's dashboard, then paste its `resend._domainkey` value.
resend_dkim_public_key = "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDST4XAk3TU3xy9BeK/D6Z4M3vz3ygWapyfBPMiNyHtKOV3bk3KiH5TZu30eNQD2QeYkGe1u9JbNca+dK2jJ5f35DxnRA2y8wPjuIWCmsUIk1+etR9XpajIE407UhHw57gCu6FKWlGX9MjOdkt+OzWj63lg0GbTgLNghjyq3zUTTQIDAQAB"
resend_region          = "eu-west-1"

# ---- Turnstile ----
# Until workers.dev is switched off, the sign-in form is served there too.
turnstile_extra_domains = ["pitchboard.migueljfscardoso.workers.dev"]
