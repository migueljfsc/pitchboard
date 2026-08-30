# ==============================================================================
# D1 — the mutable half of the data model (D39): users, sessions, projects and
# the boards themselves. Schema and migrations belong to wrangler, not here;
# OpenTofu owns the database, wrangler owns what is in it (D8).
# ==============================================================================

resource "cloudflare_d1_database" "app" {
  account_id            = var.cloudflare_account_id
  name                  = local.d1_database_name
  primary_location_hint = var.d1_location_hint

  # Cloudflare sets this server-side on creation, but the provider marks it optional
  # and NOT computed — so leaving it out plans a removal, sends null, and the API
  # refuses: 400 "Invalid property: read_replication => Expected object, received
  # null". It has to be stated even to keep the default.
  #
  # "disabled" matches the live database. Replication is free (billing is per row
  # read either way), so enabling it is a latency decision rather than a cost one.
  read_replication = {
    mode = "disabled"
  }
}
