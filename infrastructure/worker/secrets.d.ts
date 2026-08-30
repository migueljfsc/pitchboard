/**
 * Secrets, which wrangler.jsonc cannot hold and `wrangler types` therefore cannot generate.
 *
 * This merges into the ambient `Env` that worker-configuration.d.ts declares, so the two
 * halves meet without either knowing about the other. It is the one hand-written part of
 * Env, and it is hand-written because the alternative — a `.dev.vars` file, which wrangler
 * does read types from — is gitignored, so CI would regenerate an Env without these and fail
 * the typecheck of code that is perfectly correct.
 *
 * Set with:  wrangler secret put GOOGLE_CLIENT_SECRET
 */

interface Env {
  /** Google OAuth client id. Public by nature — it travels in the authorize URL. */
  GOOGLE_CLIENT_ID: string;
  /** Google OAuth client secret. Never leaves the Worker. */
  GOOGLE_CLIENT_SECRET: string;
}
