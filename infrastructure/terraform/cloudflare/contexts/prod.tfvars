environment = "prod"

# cloudflare_account_id is NOT set here (kept out of the repo). Provide it via:
#   - local: `export TF_VAR_cloudflare_account_id=...` or a gitignored *.auto.tfvars
#   - CI:    the CLOUDFLARE_ACCOUNT_ID secret, exported as TF_VAR_cloudflare_account_id
# The API token comes from the CLOUDFLARE_API_TOKEN env var.

# ---- R2 ----
r2_location = "WEUR" # Western Europe

# ---- Custom domain ----
# Empty on purpose: the Worker is served from its free workers.dev subdomain. A domain is
# the only part of this stack that costs money, so it stays a deliberate deferral.
domain = ""
