/**
 * What password sign-in shares between the form and the account menu (D109).
 */

import type { MessageKey } from "@/i18n/core";
import { ApiError } from "@/share/api";

/** Codes the auth routes emit; anything else reads as the generic line. */
const KNOWN = new Set([
  "invalid_credentials",
  "invalid_request",
  "invalid_token",
  "rate_limited",
  "captcha_failed",
]);

export function errorKey(error: unknown): MessageKey {
  const code = error instanceof ApiError && KNOWN.has(error.code) ? error.code : "unknown";
  return `account.error.${code}` as MessageKey;
}

/**
 * Into the app signed in, keeping the path and the hash (which may carry a board, D33).
 *
 * A full navigation with `?welcome=1`, exactly as the Google callback ends: `useAccount` asks
 * once at mount, and the offer to keep the local board reads that marker, so reloading is what
 * makes both behave the same whichever way the coach signed in.
 */
export function enterSignedIn(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("welcome", "1");
  window.location.assign(url.toString());
}
