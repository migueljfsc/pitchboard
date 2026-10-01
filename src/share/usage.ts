/**
 * The site's anonymous usage counters, from the browser's side (D119). The events are in
 * `usageEvents.ts`; one the Worker does not list is refused rather than stored.
 */

import type { UsageEvent } from "./usageEvents";

export type { UsageEvent };

/**
 * Bump one counter. Fire and forget: `keepalive` lets it finish as the page unloads, and
 * nothing that happens to it — offline, refused, rate-limited — is anyone's concern but the
 * operator's chart.
 */
export function countUsage(event: UsageEvent): void {
  try {
    void fetch("/api/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // A browser without fetch, or one that refuses keepalive: the count is not worth an error.
  }
}
