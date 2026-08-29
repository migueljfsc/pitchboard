import { describe, expect, it } from "vitest";
import { createBoardDoc } from "@/formations";
import { addSceneAfter } from "@/board/scenes";
import { createLink } from "@/board/links";
import {
  HASH_KEY,
  URL_BUDGET,
  decodeBoard,
  encodeBoard,
  readHash,
  shareUrl,
  withinBudget,
  withoutHash,
} from "./urlcodec";

const HREF = "https://example.com/pitchboard/";

describe("share links", () => {
  it("round-trips a board deep-equal", async () => {
    const doc = addSceneAfter(createBoardDoc(), 0);
    const out = await decodeBoard(await encodeBoard(doc));
    if (!out.ok) throw new Error(out.error);
    expect(out.doc).toEqual(doc);
  });

  it("round-trips everything a board can carry", async () => {
    let doc = addSceneAfter(createBoardDoc(), 0);
    doc = createLink(doc, doc.teams[0].players.slice(1, 5).map((p) => p.id));
    doc = {
      ...doc,
      name: "Press trap — 4-3-3 v 4-4-2",
      flow: { speed: 12.5, endHoldMs: 900 },
      annotations: [
        { id: "a1", kind: "arrow", from: doc.scenes[0].id, to: null, color: "#f59e0b",
          a: { x: 10, y: 20 }, b: { x: 40, y: 50 }, dash: "dashed" },
      ],
    };
    const out = await decodeBoard(await encodeBoard(doc));
    if (!out.ok) throw new Error(out.error);
    expect(out.doc).toEqual(doc);
  });

  it("compresses hard — a real board fits a link several times over", async () => {
    const doc = createBoardDoc();
    const payload = await encodeBoard(doc);
    expect(payload.length).toBeLessThan(JSON.stringify(doc).length);
    expect(withinBudget(payload)).toBe(true);
  });

  it("produces a payload safe in a URL", async () => {
    const payload = await encodeBoard(createBoardDoc());
    // base64url only: no +, / or = to be mangled by a client that re-encodes.
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(shareUrl(HREF, payload)).toBe(`${HREF}#${HASH_KEY}=${payload}`);
  });

  it("rejects a link cut short in transit", async () => {
    const payload = await encodeBoard(createBoardDoc());
    const out = await decodeBoard(payload.slice(0, Math.floor(payload.length / 2)));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/damaged|does not contain|cannot read/);
  });

  it("rejects a hand-tampered payload rather than opening it", async () => {
    for (const junk of ["", "not-base64!!", "AAAA", "Zm9vYmFy"]) {
      expect((await decodeBoard(junk)).ok).toBe(false);
    }
  });

  it("rejects valid JSON that is not a board", async () => {
    const { encodeBoard: enc } = await import("./urlcodec");
    // Encode something well-formed but wrong, the way a curious user might.
    const payload = await enc({ version: 1, nope: true } as never);
    const out = await decodeBoard(payload);
    expect(out.ok).toBe(false);
  });

  it("refuses a board from a newer build with the migrator's message", async () => {
    const payload = await encodeBoard({ ...createBoardDoc(), version: 99 } as never);
    const out = await decodeBoard(payload);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("newer version");
  });
});

describe("the hash", () => {
  it("finds a payload", () => {
    expect(readHash(`#${HASH_KEY}=abc`)).toBe("abc");
    expect(readHash(`${HASH_KEY}=abc`)).toBe("abc");
  });

  it("is null when there is nothing to open", () => {
    for (const hash of ["", "#", "#other=1", `#${HASH_KEY}=`]) {
      expect(readHash(hash)).toBeNull();
    }
  });

  it("strips the board back out of an address", () => {
    expect(withoutHash(`${HREF}#${HASH_KEY}=abc`)).toBe(HREF);
  });

  it("survives a payload going out and coming back through a real URL", async () => {
    const doc = createBoardDoc();
    const url = new URL(shareUrl(HREF, await encodeBoard(doc)));
    const out = await decodeBoard(readHash(url.hash)!);
    if (!out.ok) throw new Error(out.error);
    expect(out.doc).toEqual(doc);
  });
});

describe("the budget", () => {
  it("passes a board nobody would call heavy", async () => {
    let doc = createBoardDoc();
    for (let i = 0; i < 9; i++) doc = addSceneAfter(doc, i);
    const payload = await encodeBoard(doc);
    expect(withinBudget(payload)).toBe(true);
  });

  it("catches one that would be truncated in transit", () => {
    expect(withinBudget("x".repeat(URL_BUDGET))).toBe(true);
    expect(withinBudget("x".repeat(URL_BUDGET + 1))).toBe(false);
  });
});
