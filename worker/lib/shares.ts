/**
 * Publishing a board to a friendly link.
 *
 * TWO SHARING MECHANISMS, TWO AUDIENCES, AND THEY DO NOT MEET. The anonymous one predates
 * accounts and stays exactly as it was: the whole board deflated into a `#d=` fragment, which
 * browsers never send to a server, so nothing here is involved and D33's reasoning is intact.
 * This is the other one — for people with an account who want a link short enough to say out
 * loud.
 *
 * A SLUG ADDRESSES THE BOARD; A SNAPSHOT IS WHAT IT RESOLVES TO. Publishing writes a new
 * immutable snapshot and re-aims the slug at it. So the link is stable across republishes and
 * every snapshot stays individually addressable and unchanged — D39's split between mutable
 * boards and immutable published copies, without making the URL churn.
 *
 * The documents live in KV rather than D1 because that is what KV is good at here: written
 * once, then only read. The free tier allows 100k reads a day and only 1,000 writes, and a
 * publish is one write.
 */

import { newId } from "./crypto";
import { fail, json } from "./http";
import { SLUG_ALPHABET, SLUG_ATTEMPTS, SLUG_LENGTH } from "./limits";
import type { Ctx } from "./boards";

const keyFor = (snapshotId: string) => `snapshot:${snapshotId}`;

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
    "SELECT id, doc, share_slug FROM boards WHERE id = ? AND user_id = ?",
  )
    .bind(id, ctx.user.id)
    .first<{ id: string; doc: string; share_slug: string | null }>();
  if (!board) return fail("not_found", 404);

  // The document goes to KV BEFORE anything points at it. The other order leaves a window in
  // which the slug resolves to a snapshot whose body does not exist yet.
  const snapshotId = newId();
  await ctx.env.SNAPSHOTS.put(keyFor(snapshotId), board.doc);

  await ctx.env.DB.prepare(
    "INSERT INTO snapshots (id, board_id, user_id, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(snapshotId, board.id, ctx.user.id, ctx.now)
    .run();

  // An already-published board keeps its slug, or republishing would break every link the
  // author has already sent — which is the one thing a stable address must not do.
  if (board.share_slug) {
    await ctx.env.DB.prepare("UPDATE boards SET published_snapshot_id = ? WHERE id = ?")
      .bind(snapshotId, board.id)
      .run();
    return json({ slug: board.share_slug });
  }

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = newSlug();
    try {
      await ctx.env.DB.prepare(
        "UPDATE boards SET share_slug = ?, published_snapshot_id = ? WHERE id = ?",
      )
        .bind(slug, snapshotId, board.id)
        .run();
      return json({ slug });
    } catch {
      // The unique index is the arbiter, not a pre-check: a SELECT-then-INSERT has a gap in
      // which another publish takes the same slug.
      continue;
    }
  }
  return fail("slug_unavailable", 503);
}

/**
 * Withdraws the link. The snapshot rows and their KV bodies are left alone — they are
 * immutable by definition, and the board may be published again later.
 */
export async function unpublishBoard(ctx: Ctx, id: string): Promise<Response> {
  const result = await ctx.env.DB.prepare(
    "UPDATE boards SET share_slug = NULL, published_snapshot_id = NULL WHERE id = ? AND user_id = ?",
  )
    .bind(id, ctx.user.id)
    .run();
  if (result.meta.changes === 0) return fail("not_found", 404);
  return json({ ok: true });
}

/**
 * The public read. The ONLY route in the Worker that answers without a session, so it returns
 * exactly what was published and nothing about who published it — no user id, no board id, no
 * project. A withdrawn link is a 404 like any other, which tells a prober nothing.
 */
export async function readShare(env: Env, slug: string): Promise<Response> {
  const board = await env.DB.prepare(
    "SELECT name, published_snapshot_id FROM boards WHERE share_slug = ?",
  )
    .bind(slug)
    .first<{ name: string; published_snapshot_id: string | null }>();
  if (!board?.published_snapshot_id) return fail("not_found", 404);

  const doc = await env.SNAPSHOTS.get(keyFor(board.published_snapshot_id));
  if (doc === null) return fail("not_found", 404);

  return json({ share: { name: board.name, doc } });
}
