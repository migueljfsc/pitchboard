/**
 * The page's security headers. Static assets get the same set from the `_headers` file the
 * build writes from this list (`headersFile`), which the asset layer applies without
 * reaching this script.
 *
 * Turnstile is the only third party the page loads: its script, and the iframe it draws.
 * Google sign-in is a top-level navigation and needs nothing here. The export worker is
 * same-origin, and the video it encodes is handed back as a blob.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/** The `_headers` file that applies `headers` to every static asset. */
export function headersFile(headers: Readonly<Record<string, string>>): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
  return ["/*", ...lines, ""].join("\n");
}
