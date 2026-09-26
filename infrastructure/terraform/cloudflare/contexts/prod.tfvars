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
resend_dkim_public_key = "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCrEI9q45Z3DuGWYfSWlDkxPQkEEfTmiv6zaNQJKm7SVWbQu9A1enlx/8WmpkD4mequdfp43nWn0YqTh/UNQx3gnkFz8+fhV/hA7DQ89A6/Iu7PAVEYsCVos3klxEgnoybq1mtgYQtVdB+eGY6QC1ZvSDnPBUTU+cv2vgDobUQ9WwIDAQAB"

# ---- Turnstile ----
# Until workers.dev is switched off, the sign-in form is served there too.
turnstile_extra_domains = ["pitchboard.migueljfscardoso.workers.dev"]
