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
    Personal apex domain in this Cloudflare account, bought through Cloudflare Registrar and
    shared with other projects — this stack only creates records under `project_name`. The
    Worker is served from <project_name>.<domain> (wrangler.jsonc `routes`) and email is sent
    from it (D109). When empty, all DNS and custom-domain resources are skipped.
  EOT
}

###################### EMAIL (Resend) ######################

variable "resend_dkim_public_key" {
  type        = string
  default     = ""
  description = <<-EOT
    The `resend._domainkey` TXT value Resend shows once the domain is added there (starts
    `p=`). Public by nature — it is published in DNS. Empty skips every email record.
  EOT
}

variable "resend_send_target" {
  type        = string
  default     = "send.forge.rmta.net"
  description = "Where Resend's `send.` record points, as its dashboard lists it for the domain."
}

###################### TURNSTILE ######################

variable "turnstile_extra_domains" {
  type        = list(string)
  default     = []
  description = "Hostnames besides the app's own the sign-in form is served from, such as the workers.dev one."
}

variable "r2_public_hostname" {
  type        = string
  default     = "media"
  description = "Suffix of the hostname that publicly serves the R2 bucket (<project_name>-media.<domain>)."
}
