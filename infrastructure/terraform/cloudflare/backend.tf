# Remote state in the shared Cloudflare R2 bucket, via the S3-compatible backend.
#
# Everything here is non-secret and pinned in the repo so `tofu init` needs no local
# config file. The one account-specific value — the R2 endpoint — comes from the
# environment instead:
#
#   export AWS_ENDPOINT_URL_S3="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
#   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...   # an R2 API token
#   tofu init
terraform {
  backend "s3" {
    bucket = "terraform-tfstate" # shared across personal projects; isolated by key
    key    = "pitchboard/cloudflare/terraform.tfstate"
    region = "auto"

    # R2 isn't AWS — skip the AWS-specific preflight checks.
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}
