###################### CLOUDFLARE ACCOUNT ######################

variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token. Prefer the CLOUDFLARE_API_TOKEN env var over passing this."
  sensitive   = true
  default     = null
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the R2 bucket."
  nullable    = false

  validation {
    condition     = var.cloudflare_account_id != ""
    error_message = "Cloudflare account ID cannot be empty."
  }
}

###################### NAMING ######################

variable "project_name" {
  type        = string
  default     = "pitchboard"
  description = "Base name used to derive bucket names."
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Deployment environment (kept for naming parity across stacks)."
}

###################### R2 OBJECT STORAGE ######################

variable "r2_location" {
  type        = string
  default     = "WEUR"
  description = "R2 location hint (e.g. WEUR = Western Europe, ENAM, WNAM, EEUR, APAC)."
}

variable "r2_storage_class" {
  type        = string
  default     = "Standard"
  description = "Default storage class for the media bucket (Standard | InfrequentAccess)."
}

###################### D1 ######################

variable "d1_location_hint" {
  type        = string
  default     = "weur"
  description = "D1 primary location hint (weur | eeur | apac | wnam | enam | oc)."
}

###################### CUSTOM DOMAIN (forward-looking) ######################

variable "domain" {
  type        = string
  default     = ""
  description = <<-EOT
    Apex domain managed in this Cloudflare account. When empty, all DNS and custom-domain
    resources are skipped and the Worker is reached on its workers.dev subdomain instead.
    Set it only if the project earns a domain — see docs/decisions.md.
  EOT
}

variable "r2_public_hostname" {
  type        = string
  default     = "media"
  description = "Subdomain used to publicly serve the R2 bucket (e.g. media.<domain>)."
}
