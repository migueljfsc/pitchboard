/**
 * The self-contained share link: `#d=<base64url(deflate-raw(json))>`.
 *
 * No backend, works offline, survives the API being down, and cannot rot —
 * everything needed to open the board is in the link itself. That is what makes
 * D7's immutable snapshot real: there is nothing to expire, and nothing to grant
 * write access to.
 *
 * Compression is the native `CompressionStream`, so nothing is bundled for it.
 * `deflate-raw` rather than `gzip` because the gzip header is 18 bytes of pure
 * overhead when the payload is going into a URL.
 */

import type { BoardDoc } from "@/board/types";
import { boardDocSchema } from "@/board/schema";
import { migrate } from "@/board/migrate";

/** The hash parameter a shared board travels in. */
export const HASH_KEY = "d";

/**
 * Encoded characters beyond which a link stops being reliably shareable.
 *
 * Not a browser limit — Chrome and Safari both carry far more. It is the
 * chat clients, mail gateways and issue trackers in between, which truncate
 * silently, so the recipient gets a broken board rather than an error. A
 * ten-scene board with a path on every player encodes to about 3,300
 * characters, so only a board heavy with freehand comes near this.
 */
export const URL_BUDGET = 8000;

export type DecodeOutcome = { ok: true; doc: BoardDoc } | { ok: false; error: string };

// ------------------------------------------------------------------ base64url

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Built into a fresh buffer so the result is ArrayBuffer-backed, which is what
 *  a stream writer will accept — `Uint8Array.from` leaves it ArrayBufferLike. */
const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// ---------------------------------------------------------------- compression

/**
 * Push `bytes` through a transform stream and read the far end.
 *
 * The write side and the read side settle on the SAME failure — a corrupt
 * payload rejects both — so the write is caught and dropped here and the error
 * is allowed to surface once, from the read. Leaving the write promise floating
 * instead makes every damaged link an unhandled rejection as well as a caught
 * one.
 */
async function pump(stream: TransformStream<BufferSource, Uint8Array>, bytes: BufferSource) {
  const writer = stream.writable.getWriter();
  const written = writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => {});
  try {
    return await new Response(stream.readable).arrayBuffer();
  } finally {
    await written;
  }
}

async function deflate(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const encoded = new TextEncoder().encode(text);
  return new Uint8Array(await pump(new CompressionStream("deflate-raw"), encoded));
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new TextDecoder().decode(await pump(new DecompressionStream("deflate-raw"), bytes));
}

// --------------------------------------------------------------------- public

export async function encodeBoard(doc: BoardDoc): Promise<string> {
  return toBase64Url(await deflate(JSON.stringify(doc)));
}

/**
 * Read a payload back into a board.
 *
 * Migrated before it is validated, and validated before it is returned: a link
 * is the least trusted input in the app, since anyone can edit the characters
 * after the `#` and hand it to someone else.
 */
export async function decodeBoard(payload: string): Promise<DecodeOutcome> {
  let json: string;
  try {
    json = await inflate(fromBase64Url(payload));
  } catch {
    return { ok: false, error: "That link is damaged — it may have been cut short in transit." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "That link does not contain a board." };
  }

  const migrated = migrate(raw);
  if (!migrated.ok) return migrated;

  const parsed = boardDocSchema.safeParse(migrated.doc);
  return parsed.success
    ? { ok: true, doc: parsed.data as BoardDoc }
    : { ok: false, error: "That link contains a board this version cannot read." };
}

/** The payload carried by a location hash, or null when there is none. */
export function readHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const payload = params.get(HASH_KEY);
  return payload && payload.length > 0 ? payload : null;
}

/** A shareable URL for `payload`, built from the page's own address. */
export function shareUrl(href: string, payload: string): string {
  const url = new URL(href);
  url.hash = `${HASH_KEY}=${payload}`;
  return url.toString();
}

/** The same address with the shared board stripped out of it. */
export function withoutHash(href: string): string {
  const url = new URL(href);
  url.hash = "";
  return url.toString();
}

export const withinBudget = (payload: string): boolean => payload.length <= URL_BUDGET;
