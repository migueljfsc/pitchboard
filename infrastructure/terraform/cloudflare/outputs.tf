output "r2_bucket_name" {
  value       = cloudflare_r2_bucket.media.name
  description = "Name of the R2 media bucket."
}

output "r2_s3_endpoint" {
  value       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  description = "S3-compatible endpoint for uploading to R2 (rclone / aws s3 / TF state)."
}

output "r2_public_url" {
  value       = local.has_domain ? "https://${local.r2_public_fqdn}" : "https://${cloudflare_r2_managed_domain.media.domain}"
  description = "Public base URL for served assets — the custom domain when set, otherwise the managed r2.dev subdomain."
}

# The two ids below are the manual step D8 accepted: paste them into the Worker's
# wrangler.jsonc bindings after the first apply. OpenTofu does not own the script.
output "d1_database_id" {
  value       = cloudflare_d1_database.app.id
  description = "D1 database id, for the d1_databases binding in wrangler.jsonc."
}

output "d1_database_name" {
  value       = cloudflare_d1_database.app.name
  description = "D1 database name, for the d1_databases binding and wrangler d1 commands."
}

output "kv_snapshots_namespace_id" {
  value       = cloudflare_workers_kv_namespace.snapshots.id
  description = "KV namespace id for published snapshots, for the kv_namespaces binding."
}
