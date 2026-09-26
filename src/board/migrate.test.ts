import { describe, expect, it } from "vitest";
import { say } from "@/i18n/core";
import { en } from "@/i18n/en";
import { createBoardDoc } from "@/formations";
import { CURRENT_VERSION, migrate } from "./migrate";

describe("migrate", () => {
  it("passes a current document through untouched", () => {
    const doc = createBoardDoc();
    const out = migrate(doc);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.doc).toBe(doc);
  });

  it("refuses a document from a newer build, by name", () => {
    const out = migrate({ ...createBoardDoc(), version: CURRENT_VERSION + 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(say(en, out.error)).toContain("newer version");
      expect(say(en, out.error)).toContain(`v${CURRENT_VERSION + 1}`);
    }
  });

  it("refuses anything with no version, or that is not an object at all", () => {
    for (const raw of [{}, { version: "1" }, { version: 0 }, { version: 1.5 }]) {
      expect(migrate(raw).ok).toBe(false);
    }
    for (const raw of [null, undefined, 42, "board", [], true]) {
      const out = migrate(raw);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(say(en, out.error)).toContain("not a Pitchboard board");
    }
  });

  it("reports a gap in the chain rather than half-migrating", () => {
    // Reachable only if a future build bumps CURRENT_VERSION without adding the
    // step for it. The document must not reach the validator either way.
    if (CURRENT_VERSION === 1) return;
    expect(migrate({ version: 1 }).ok).toBe(false);
  });

});
