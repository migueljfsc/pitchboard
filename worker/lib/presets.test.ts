import { describe, expect, it } from "vitest";

import { cleanBody, cleanLabel } from "./presets";
import { MAX_PRESET_BYTES, MAX_PRESET_LABEL_CHARS } from "./limits";

describe("cleanLabel", () => {
  it("trims and accepts a real name", () => {
    expect(cleanLabel("  Our first XI  ")).toBe("Our first XI");
  });

  it("rejects anything that is not a non-empty string", () => {
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel("   ")).toBeNull();
    expect(cleanLabel(undefined)).toBeNull();
    expect(cleanLabel(null)).toBeNull();
    expect(cleanLabel(11)).toBeNull();
    expect(cleanLabel(["Arsenal"])).toBeNull();
  });

  it("accepts the longest allowed label and rejects one character more", () => {
    expect(cleanLabel("x".repeat(MAX_PRESET_LABEL_CHARS))).toHaveLength(MAX_PRESET_LABEL_CHARS);
    expect(cleanLabel("x".repeat(MAX_PRESET_LABEL_CHARS + 1))).toBeNull();
  });

  // Trimming happens before measuring, so padding does not eat the budget.
  it("measures after trimming", () => {
    expect(cleanLabel(` ${"x".repeat(MAX_PRESET_LABEL_CHARS)} `)).toHaveLength(
      MAX_PRESET_LABEL_CHARS,
    );
  });
});

describe("cleanBody", () => {
  it("accepts well-formed JSON", () => {
    expect(cleanBody('{"formation":"4-3-3"}')).toBe('{"formation":"4-3-3"}');
  });

  // Storing something the client cannot parse loses the squad, which is why this is checked
  // even though the schema itself deliberately is not.
  it("rejects malformed JSON", () => {
    expect(cleanBody("{not json")).toBeNull();
    expect(cleanBody("")).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(cleanBody({ formation: "4-3-3" })).toBeNull();
    expect(cleanBody(undefined)).toBeNull();
    expect(cleanBody(null)).toBeNull();
  });

  it("measures bytes rather than characters", () => {
    // Two bytes each in UTF-8, so half the byte budget in characters is the whole of it.
    const accented = "é".repeat(MAX_PRESET_BYTES / 2);
    expect(cleanBody(JSON.stringify({ name: accented }))).toBeNull();
  });

  it("accepts a body at the byte cap", () => {
    const filler = "x".repeat(MAX_PRESET_BYTES - 12);
    const at = JSON.stringify({ n: filler });
    expect(at.length).toBeLessThanOrEqual(MAX_PRESET_BYTES);
    expect(cleanBody(at)).toBe(at);
  });
});
