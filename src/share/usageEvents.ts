/**
 * Every anonymous usage event there is (D119). Kept apart from `usage.ts`, which calls `fetch`,
 * so the Worker's test can import the list and fail when it drifts from `worker/lib/usage.ts`.
 */

export const USAGE_EVENTS = [
  "page.landing",
  "page.editor",
  "page.viewer",
  "export.mp4",
  "export.webm",
  "export.gif",
  "export.png",
  "share.snapshot",
  "share.live",
  "import.board",
  "import.setup",
  "import.tracks",
  "present",
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

export const isUsageEvent = (value: string): value is UsageEvent =>
  (USAGE_EVENTS as readonly string[]).includes(value);
