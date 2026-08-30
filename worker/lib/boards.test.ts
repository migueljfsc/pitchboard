import { describe, expect, it } from "vitest";

import { cleanDoc, cleanName } from "./boards";
import { MAX_DOC_BYTES, MAX_NAME_CHARS } from "./limits";

describe("cleanName", () => {
  it("trims and accepts a real name", () => {
    expect(cleanName("  Sunday vs Old Boys  ")).toBe("Sunday vs Old Boys");
  });

  it("rejects anything that is not a non-empty string", () => {
    expect(cleanName("")).toBeNull();
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(undefined)).toBeNull();
    expect(cleanName(null)).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName(["a"])).toBeNull();
  });

  it("accepts the longest allowed name and rejects one character more", () => {
    expect(cleanName("x".repeat(MAX_NAME_CHARS))).toHaveLength(MAX_NAME_CHARS);
    expect(cleanName("x".repeat(MAX_NAME_CHARS + 1))).toBeNull();
  });

  // Trimming happens before measuring, so padding does not eat the budget.
  it("measures after trimming", () => {
    expect(cleanName(` ${"x".repeat(MAX_NAME_CHARS)} `)).toHaveLength(MAX_NAME_CHARS);
  });
});

describe("cleanDoc", () => {
  it("accepts well-formed JSON", () => {
    expect(cleanDoc('{"scenes":[]}')).toBe('{"scenes":[]}');
  });

  // Storing something the client cannot parse loses the board, which is why this is checked
  // even though the schema itself deliberately is not.
  it("rejects malformed JSON", () => {
    expect(cleanDoc("{not json")).toBeNull();
    expect(cleanDoc("")).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(cleanDoc({ scenes: [] })).toBeNull();
    expect(cleanDoc(undefined)).toBeNull();
  });

  it("caps on bytes rather than characters", () => {
    // Every one of these is 3 bytes, so a document well inside the character budget is
    // outside the byte budget — which is the case a length check would wave through.
    const wide = "€".repeat(MAX_DOC_BYTES / 3);
    expect(wide.length).toBeLessThan(MAX_DOC_BYTES);
    expect(cleanDoc(JSON.stringify({ n: wide }))).toBeNull();
  });

  it("accepts a document just inside the cap", () => {
    const doc = JSON.stringify({ n: "x".repeat(MAX_DOC_BYTES - 100) });
    expect(cleanDoc(doc)).toBe(doc);
  });
});
