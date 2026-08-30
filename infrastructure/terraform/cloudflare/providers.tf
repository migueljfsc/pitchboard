terraform {
  required_version = "~> 1.11"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth via the CLOUDFLARE_API_TOKEN env var, or pass -var cloudflare_api_token=...
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
