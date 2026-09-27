/**
 * Publishing a board to a friendly link.
 *
 * TWO SHARING MECHANISMS, TWO AUDIENCES, AND THEY DO NOT MEET. The anonymous one predates
 * accounts and stays exactly as it was: the whole board deflated into a `#d=` fragment, which
 * browsers never send to a server, so nothing here is involved and D7's reasoning is intact.
 * This is the other one — for people with an account who want a link short enough to say out
 * loud.
 *
 * A SLUG POINTS AT THE BOARD, AND FOLLOWS IT. Reloading the link shows the board as it is
 * now, not as it was when it was published. This is the whole difference between the two
 * mechanisms and the reason both exist (0004): a link to a board you own should not need
 * republishing every time you change something, and a reader has no way to tell that what
 * they are looking at is stale.
 *
 * Immutability lives in the other one. `#d=` carries the entire board inside the URL, so it
 * is frozen by construction, needs no account and never reaches a server at all (D7).
 *
 * Publishing is therefore just minting a slug. There is no snapshot to write, nothing in KV,
 * and withdrawing is clearing one column.
 */

import { fail, json } from "./http";
import { SLUG_ALPHABET, SLUG_ATTEMPTS, SLUG_LENGTH } from "./limits";
import type { Ctx } from "./boards";

/**
 * Rejection sampling, not modulo. `256 % 27` is not zero, so folding a random byte with `%`
 * would make the first four letters of the alphabet measurably likelier than the rest.
 */
export function newSlug(): string {
  const out: string[] = [];
  while (out.length < SLUG_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))) {
      if (byte >= 243) continue; // 243 = 27 * 9, the largest exact multiple below 256
      out.push(SLUG_ALPHABET[byte % SLUG_ALPHABET.length]);
      if (out.length === SLUG_LENGTH) break;
    }
  }
  return out.join("");
}

export async function publishBoard(ctx: Ctx, id: string): Promise<Response> {
  const board = await ctx.env.DB.prepare(
    "SELECT id, share_slug FROM boards WHERE id = ? AND user_id = ?",
  )
    .bind(id, ctx.user.id)
    .first<{ id: string; share_slug: string | null }>();
  if (!board) return fail("not_found", 404);

  // An already-published board keeps its slug. Minting a new one would break every link the
  // author has already sent, which is the one thing a stable address must not do.
  if (board.share_slug) return json({ slug: board.share_slug });

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = newSlug();
    try {
      await ctx.env.DB.prepare("UPDATE boards SET share_slug = ? WHERE id = ?")
        .bind(slug, board.id)
        .run();
      return json({ slug });
    } catch {
      // The unique index is the arbiter, not a pre-check: a SELECT-then-UPDATE has a gap in
      // which another publish takes the same slug.
      continue;
    }
  }
  return fail("slug_unavailable", 503);
}

/** Withdraws the link. Publishing again mints a NEW slug; the old one stays dead. */
export async function unpublishBoard(ctx: Ctx, id: string): Promise<Response> {
  const result = await ctx.env.DB.prepare(
    "UPDATE boards SET share_slug = NULL WHERE id = ? AND user_id = ?",
  )
    .bind(id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ ok: true });
}

/**
 * Text for an HTML attribute or element. The board's name is whatever its owner typed, and
 * it lands inside `content="…"` on a public page.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A published board's page: the app's own page, with the board's name in its title and
 * link-preview tags, so a link pasted into a chat says what it is. The app reads the board
 * itself from `/api/share/<slug>` as ever; this changes only what the page is called.
 * A link that is withdrawn or gone gets the page unchanged, which the app then explains.
 */
export async function sharePage(request: Request, env: Env, slug: string): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  const board = await env.DB.prepare("SELECT name FROM boards WHERE share_slug = ?")
    .bind(slug)
    .first<{ name: string }>();
  if (!board) return page;

  const title = escapeHtml(`${board.name} — Pitchboard`);
  const retitle = {
    element(el: Element) {
      el.setAttribute("content", title);
    },
  };
  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title, { html: true });
      },
    })
    .on('meta[property="og:title"]', retitle)
    .on('meta[name="twitter:title"]', retitle)
    .transform(page);
}

/**
 * The public read, and the ONLY route in the Worker that answers without a session. It returns
 * the board as it is right now and nothing about who owns it — no user id, no board id, no
 * project. A withdrawn link, or one whose board has been deleted, is a 404 like any other,
 * which tells a prober nothing.
 */
export async function readShare(env: Env, slug: string): Promise<Response> {
  const board = await env.DB.prepare("SELECT name, doc FROM boards WHERE share_slug = ?")
    .bind(slug)
    .first<{ name: string; doc: string }>();
  return board ? json({ share: { name: board.name, doc: board.doc } }) : fail("not_found", 404);
}
