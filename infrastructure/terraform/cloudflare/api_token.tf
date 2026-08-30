# ==============================================================================
# The account API token this stack authenticates with is NOT managed here.
#
# It was, briefly, and the lesson was expensive enough to write down: a
# self-managing credential can only ever be widened out of band, never narrowed
# safely. The apply that narrows it is the last one that can run.
#
# What happened: `cloudflare_account_token.ci` listed the permission groups the
# stack needs and omitted API Tokens read/write, because nothing in the stack
# needed them. The apply rewrote the live token to exactly that set, which
# stripped the token's ability to read ITSELF. Every plan afterwards died in the
# refresh phase — `GET /accounts/*/tokens/* -> 403 code 9109` — before reaching
# the apply that would have granted the permission back. prevent_destroy did not
# help: nothing was destroyed, the token simply went blind to itself.
#
# So the token is created and edited by hand in the dashboard, and its value
# lives only in the CLOUDFLARE_API_TOKEN GitHub secret. Two things fall out of
# that which are worth having anyway:
#
#   - the secret never enters state. `value` is computed and sensitive, so a
#     CREATE here would write an account-wide credential into the R2 state
#     bucket and turn read access to that bucket into account access.
#   - the blast radius of a bad plan no longer includes the credential the plan
#     itself is holding.
#
# The scopes it needs are listed in README.md under Prerequisites.
#
# This `removed` block detaches the resource from state WITHOUT touching the
# live token — `destroy = false` is a forget, not a delete. It is a one-shot:
# once the apply that forgets it has landed on main, this whole file can go.
# ==============================================================================

removed {
  from = cloudflare_account_token.ci

  lifecycle {
    destroy = false
  }
}
