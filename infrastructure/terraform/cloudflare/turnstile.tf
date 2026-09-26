# ==============================================================================
# Turnstile — the bot check on the two routes that make the Worker send email:
# registering and asking for a password reset (D109). Each call spends one of
# Resend's 100 free sends a day and lands in a stranger's inbox.
#
# The sitekey is public and goes into src/components/Turnstile.tsx; the secret
# goes to the Worker with `wrangler secret put TURNSTILE_SECRET_KEY`. Both are
# stable for the life of the widget. The secret sits in state, which is private
# (R2), and never in the repository.
# ==============================================================================

resource "cloudflare_turnstile_widget" "auth" {
  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-auth"
  domains    = local.turnstile_domains

  # Shows an interaction only when the browser looks automated.
  mode = "managed"
}
