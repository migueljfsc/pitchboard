import { describe, expect, it } from "vitest";

import { cleanName } from "./formations";
import { MAX_FORMATION_NAME_CHARS } from "./limits";

describe("a drawn formation's name (D122)", () => {
  it("is trimmed, and must say something", () => {
    expect(cleanName("  Wide 4-3-3  ")).toBe("Wide 4-3-3");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(7)).toBeNull();
  });

  // The browser's schema caps a shape's name at forty too (`teamShapeSchema`).
  it("is bounded at forty characters", () => {
    expect(MAX_FORMATION_NAME_CHARS).toBe(40);
    expect(cleanName("x".repeat(MAX_FORMATION_NAME_CHARS))).not.toBeNull();
    expect(cleanName("x".repeat(MAX_FORMATION_NAME_CHARS + 1))).toBeNull();
  });
});
