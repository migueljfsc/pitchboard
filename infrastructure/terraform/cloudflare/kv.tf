# ==============================================================================
# KV — the immutable half (D39): published board snapshots, written once and
# then only read. Free tier allows 1k writes/day against 100k reads/day, which
# is the right way round for this half and the wrong way round for the other.
# ==============================================================================

resource "cloudflare_workers_kv_namespace" "snapshots" {
  account_id = var.cloudflare_account_id
  title      = local.kv_snapshots_title
}
