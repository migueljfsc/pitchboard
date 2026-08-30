# ==============================================================================
# D1 — the mutable half of the data model (D39): users, sessions, projects and
# the boards themselves. Schema and migrations belong to wrangler, not here;
# OpenTofu owns the database, wrangler owns what is in it (D8).
# ==============================================================================

resource "cloudflare_d1_database" "app" {
  account_id            = var.cloudflare_account_id
  name                  = local.d1_database_name
  primary_location_hint = var.d1_location_hint
}
