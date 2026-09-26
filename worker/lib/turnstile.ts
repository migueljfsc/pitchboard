/**
 * Turnstile, on the two routes that send email (D109).
 *
 * Those are the routes a script can turn into a cost: each call spends one of Resend's 100
 * free sends a day and lands in a stranger's inbox. Signing in sends nothing and is only rate
 * limited, so a coach is not asked to prove they are human every time they log in.
 *
 * The check is a `fetch`, which is I/O and costs none of the CPU budget.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function passesTurnstile(
  env: Env,
  token: unknown,
  ip: string | null,
): Promise<boolean> {
  // Cloudflare documents 2,048 characters as the longest a token can be.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetch(SITEVERIFY, { method: "POST", body });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
