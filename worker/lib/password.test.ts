import { describe, expect, it } from "vitest";

import { base64url } from "./crypto";
import { composeMail } from "./mail";
import { hashKey, isKey, normaliseEmail, verifyKey } from "./password";

const KEY = "a".repeat(43);
const OTHER = "b".repeat(43);

const PEPPER = "pepper";

async function v1(key: string): Promise<string> {
  const salt = "c2FsdA";
  const bytes = new TextEncoder().encode(`${salt}$${key}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `v1$${salt}$${base64url(digest)}`;
}

describe("hashKey / verifyKey", () => {
  it("verifies the key it hashed and nothing else", async () => {
    const stored = await hashKey(KEY, PEPPER);
    expect(stored.startsWith("v2$")).toBe(true);
    expect(await verifyKey(KEY, stored, PEPPER)).toEqual({ ok: true, stale: false });
    expect((await verifyKey(OTHER, stored, PEPPER)).ok).toBe(false);
  });

  // The pepper is the secret held apart from the database: a stored value without it is
  // unverifiable, which is the point.
  it("does not verify under another pepper", async () => {
    expect((await verifyKey(KEY, await hashKey(KEY, PEPPER), "other")).ok).toBe(false);
  });

  it("refuses to hash without a pepper rather than storing something weaker", async () => {
    await expect(hashKey(KEY, "")).rejects.toThrow();
  });

  it("salts per row, so one key never stores the same value twice", async () => {
    expect(await hashKey(KEY, PEPPER)).not.toBe(await hashKey(KEY, PEPPER));
  });

  it("still verifies an unpeppered v1 row, and says it is stale", async () => {
    const stored = await v1(KEY);
    expect(await verifyKey(KEY, stored, PEPPER)).toEqual({ ok: true, stale: true });
    expect((await verifyKey(OTHER, stored, PEPPER)).ok).toBe(false);
  });

  // A Google-only account has password_hash NULL. "No password" must never let anyone in.
  it("refuses a missing or malformed stored value", async () => {
    for (const stored of [null, "", "v3$salt$digest", "v1$$", "v2$$"]) {
      expect((await verifyKey(KEY, stored, PEPPER)).ok).toBe(false);
    }
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
