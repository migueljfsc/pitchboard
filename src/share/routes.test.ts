import { describe, expect, it } from "vitest";

import { boardPath, readBoardId, readShareSlug, sharePath } from "./routes";

describe("readBoardId", () => {
  it("reads a board id", () => {
    expect(readBoardId("/board/9Q82CqPzAqBcX7DPgeeo3A")).toBe("9Q82CqPzAqBcX7DPgeeo3A");
  });

  // Ids are 22 base64url characters. Matching loosely would send a request that was never
  // going to resolve, and would let the address claim a board that cannot exist.
  it("rejects anything that is not one", () => {
    expect(readBoardId("/board/short")).toBeNull();
    expect(readBoardId("/board/9Q82CqPzAqBcX7DPgeeo3A/extra")).toBeNull();
    expect(readBoardId("/boards/9Q82CqPzAqBcX7DPgeeo3A")).toBeNull();
    expect(readBoardId("/")).toBeNull();
  });

  it("round-trips through boardPath", () => {
    const id = "9Q82CqPzAqBcX7DPgeeo3A";
    expect(readBoardId(boardPath(id))).toBe(id);
  });
});

describe("readShareSlug", () => {
  it("reads a slug from the canonical path", () => {
    expect(readShareSlug("/share/3g839hk7")).toBe("3g839hk7");
    expect(sharePath("3g839hk7")).toBe("/share/3g839hk7");
  });

  it("rejects the wrong length, the wrong alphabet, or the old short path", () => {
    expect(readShareSlug("/share/3g839hk")).toBeNull();
    expect(readShareSlug("/share/aeiou123")).toBeNull();
    expect(readShareSlug("/share/3g839hk77")).toBeNull();
    expect(readShareSlug("/s/3g839hk7")).toBeNull();
  });

  // The two path shapes must never both match: one opens an editor, the other a read-only
  // viewer, and a path that could be either would resolve by whichever was checked first.
  it("does not collide with a board path", () => {
    expect(readShareSlug("/board/9Q82CqPzAqBcX7DPgeeo3A")).toBeNull();
    expect(readBoardId("/share/3g839hk7")).toBeNull();
  });
});
