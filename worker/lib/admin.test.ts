import { describe, expect, it } from "vitest";

import { adminEmails, isAdmin } from "./admin";

const user = (email: string) => ({ id: "u".repeat(22), email, displayName: null });

describe("adminEmails", () => {
  it("splits, trims and lowercases", () => {
    expect([...adminEmails(" A@x.com, b@y.com ,,")]).toEqual(["a@x.com", "b@y.com"]);
  });

  it("is empty when unset", () => {
    expect(adminEmails(undefined).size).toBe(0);
    expect(adminEmails("").size).toBe(0);
  });
});

describe("isAdmin", () => {
  it("admits a listed address, whatever its case", () => {
    expect(isAdmin(user("Me@X.com"), "me@x.com")).toBe(true);
  });

  it("refuses an unlisted user, a stranger, and everybody when the secret is unset", () => {
    expect(isAdmin(user("other@x.com"), "me@x.com")).toBe(false);
    expect(isAdmin(null, "me@x.com")).toBe(false);
    expect(isAdmin(user("me@x.com"), undefined)).toBe(false);
  });

  // An empty entry must not match an account whose email is somehow empty.
  it("does not treat blank entries as an address", () => {
    expect(isAdmin(user(""), ",")).toBe(false);
  });
});
