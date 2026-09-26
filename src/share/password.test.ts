import { describe, expect, it } from "vitest";

import { deriveKey } from "./password";

// Computed independently with Python's hashlib.pbkdf2_hmac. If this test fails, the change
// that broke it would lock every password account out: the same password no longer derives
// the key the server stored.
const VECTOR = "CmD9Nt6eIGsuQ8c8_IJo_AV30NeCZlXuI7TN76bBV8U";

describe("deriveKey", () => {
  it("derives the frozen key for a known email and password", async () => {
    expect(await deriveKey("coach@example.com", "correct horse battery staple")).toBe(VECTOR);
  });

  it("salts with the normalised address, so case and spacing do not matter", async () => {
    expect(await deriveKey("  Coach@Example.COM ", "correct horse battery staple")).toBe(VECTOR);
  });

  it("gives another address another key", async () => {
    expect(await deriveKey("other@example.com", "correct horse battery staple")).not.toBe(VECTOR);
  });
});
