# ==============================================================================
# The account API token this stack authenticates with, and that CI presents.
#
# SELF-MANAGEMENT. This is OpenTofu's own credential. Terraform managing the key
# it authenticates with is a loaded gun: a replacement revokes the token mid-run
# and locks CI out until the GitHub secret is replaced by hand. prevent_destroy
# blocks the worst case, but an edit to `policies` still rewrites the live token,
# so read any plan that touches this resource before applying it.
#
# STATE. `value` is computed and sensitive. On CREATE the secret is written to
# state — into the R2 state bucket — which turns read access to that bucket into
# an account-wide credential. On IMPORT Cloudflare does not return the value; it
# is shown once, at creation, and never again. Adopting the existing token
# therefore keeps the secret out of state entirely, which is what the import
# block below is for. This resource should never create anything.
# ==============================================================================

resource "cloudflare_account_token" "ci" {
  account_id = var.cloudflare_account_id

  # Must match the live token's name, or the import plans a rename.
  name = var.project_name

  policies = [{
    effect = "allow"

    # Opaque ids, as exported by the dashboard. Resolve them to names with:
    #   curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    #     "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/tokens/permission_groups" \
    #     | jq -r '.result[] | "\(.id)  \(.name)"'
    #
    # NOTE: 27 groups scoped to the whole account ("*"). Two of them are API
    # Tokens read/write and are load-bearing: without them this resource cannot
    # refresh ITSELF, and an apply that omitted them stripped the permission from
    # the live token and 403'd every plan afterwards. Do not prune those two.
    # The stack otherwise needs R2, D1 and KV edit, plus Workers Scripts edit
    # once the deploy pipeline lands. The rest are worth narrowing.
    permission_groups = [{
      id = "2e0d8adc461d4cf78651efa2dfbb237c"
      }, {
      id = "a649bfc3532148768b854e294a544425"
      }, {
      id = "136d0be1ddc64eaf8516fa6994abfad4"
      }, {
      id = "9bb90620717647a39679e1d951f140d6"
      }, {
      id = "f45430d92e2b4a6cb9f94f2594c141b8"
      }, {
      id = "bdbcd690c763475a985e8641dddc09f7"
      }, {
      id = "cfd39eebc07c4e3ea849e4b3d2644637"
      }, {
      id = "82c075da3f4647a2a03becd0fe240f8a"
      }, {
      id = "66c1ed49f4ed46098b75696a6d4ee3c9"
      }, {
      id = "d229766a2f7f4d299f20eaa8c9b1fde9"
      }, {
      id = "5b7aedd821a548b9bf5a2acabbce98c7"
      }, {
      id = "95d69e8d6d5144bfb0923667355d9f11"
      }, {
      id = "dc44f27f48ab405392a5f69fe822bd01"
      }, {
      id = "cfa964bcdafc4ab39704e7476154e41b"
      }, {
      id = "2e095cf436e2455fa62c9a9c2e18c478"
      }, {
      id = "ad99c5ae555e45c4bef5bdf2678388ba"
      }, {
      id = "5bc3f8b21c554832afc660159ab75fa4"
      }, {
      id = "eb56a6953c034b9d97dd838155666f06"
      }, {
      id = "192192df92ee43ac90f2aeeffce67e35"
      }, {
      id = "09b2857d1c31407795e75e3fed8617a1"
      }, {
      id = "bf7481a1826f439697cb59a20b22293e"
      }, {
      id = "f7f0eda5697f475c90846e879bab8666"
      }, {
      id = "8b47d2786a534c08a1f94ee8f9f599ef"
      }, {
      id = "e086da7e2179491d91ee5f35b3ca210a"
      }, {
      id = "1a71c399035b4950a1bd1466bbe4f420"
      }, {
      id = "da6d2d6f2ec8442eaadda60d13f42bca"
      }, {
      id = "5f48a472240a4b489a21d43bd19a06e1"
    }]

    resources = jsonencode({
      "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
    })
  }]

  lifecycle {
    # This token is how OpenTofu talks to Cloudflare. Destroying it is never the
    # intended outcome of a plan.
    prevent_destroy = true
  }
}
