import { describe, expect, it } from "vitest";

import { composeMail } from "./mail";
import { hashKey, isKey, normaliseEmail, verifyKey } from "./password";

const KEY = "a".repeat(43);
const OTHER = "b".repeat(43);

describe("hashKey / verifyKey", () => {
  it("verifies the key it hashed and nothing else", async () => {
    const stored = await hashKey(KEY);
    expect(await verifyKey(KEY, stored)).toBe(true);
    expect(await verifyKey(OTHER, stored)).toBe(false);
  });

  it("salts per row, so one key never stores the same value twice", async () => {
    expect(await hashKey(KEY)).not.toBe(await hashKey(KEY));
  });

  // A Google-only account has password_hash NULL. "No password" must never let anyone in.
  it("refuses a missing or malformed stored value", async () => {
    expect(await verifyKey(KEY, null)).toBe(false);
    expect(await verifyKey(KEY, "")).toBe(false);
    expect(await verifyKey(KEY, "v2$salt$digest")).toBe(false);
    expect(await verifyKey(KEY, "v1$$")).toBe(false);
  });
});

describe("isKey", () => {
  it("accepts only 32 bytes of base64url", () => {
    expect(isKey(KEY)).toBe(true);
    expect(isKey("a".repeat(42))).toBe(false);
    expect(isKey("a".repeat(44))).toBe(false);
    expect(isKey(`${"a".repeat(42)}=`)).toBe(false);
    expect(isKey(123)).toBe(false);
  });
});

describe("normaliseEmail", () => {
  // The browser salts the key with this same normalisation. If the two ever disagree, a
  // password typed correctly derives a key the server has never seen.
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Coach@Example.COM ")).toBe("coach@example.com");
  });

  it("rejects what is plainly not an address", () => {
    expect(normaliseEmail("coach")).toBeNull();
    expect(normaliseEmail("coach@example")).toBeNull();
    expect(normaliseEmail("a b@example.com")).toBeNull();
    expect(normaliseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
  });
});

describe("composeMail", () => {
  it("carries the link in both parts and escapes it in the HTML", () => {
    const link = 'https://pitchboard.example/?verify=abc&x="y"';
    const mail = composeMail("verify", "en", link);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain("verify=abc&amp;x=&quot;y&quot;");
    expect(mail.html).not.toContain('"y"');
  });
});
