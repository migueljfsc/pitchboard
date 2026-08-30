import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE,
  SESSION_SLIDE_AFTER_S,
  SESSION_TTL_S,
  clearedSessionCookie,
  readCookie,
  sessionCookie,
  shouldRenew,
} from "./session";

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("a=1; pb_session=tok; b=2", SESSION_COOKIE)).toBe("tok");
  });

  it("returns null for a missing header or a missing name", () => {
    expect(readCookie(null, SESSION_COOKIE)).toBeNull();
    expect(readCookie("a=1; b=2", SESSION_COOKIE)).toBeNull();
  });

  it("does not match a name by prefix or suffix", () => {
    expect(readCookie("xpb_session=no; pb_session_old=no", SESSION_COOKIE)).toBeNull();
  });

  // base64url strips padding, but nothing guarantees a future value will. Splitting on the
  // last `=` instead of the first would silently truncate the credential.
  it("splits on the first equals only", () => {
    expect(readCookie("pb_session=a=b=c", SESSION_COOKIE)).toBe("a=b=c");
  });

  it("tolerates whitespace and empty segments", () => {
    expect(readCookie(" ; pb_session = tok ; ", SESSION_COOKIE)).toBe("tok");
  });
});

describe("sessionCookie", () => {
  it("carries the flags that make it a session credential", () => {
    const c = sessionCookie("tok", SESSION_TTL_S);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toContain(`Max-Age=${SESSION_TTL_S}`);
  });

  it("round-trips through readCookie", () => {
    const value = sessionCookie("tok", SESSION_TTL_S).split(";")[0];
    expect(readCookie(value, SESSION_COOKIE)).toBe("tok");
  });

  it("clears with Max-Age=0 and an empty value", () => {
    expect(clearedSessionCookie()).toContain("Max-Age=0");
    expect(readCookie(clearedSessionCookie().split(";")[0], SESSION_COOKIE)).toBe("");
  });
});

describe("shouldRenew", () => {
  const now = 1_700_000_000;

  it("does not renew a session that was just issued", () => {
    expect(shouldRenew(now + SESSION_TTL_S, now)).toBe(false);
  });

  it("renews once the session has lost more than the slide window", () => {
    const issuedAt = now - SESSION_SLIDE_AFTER_S - 1;
    expect(shouldRenew(issuedAt + SESSION_TTL_S, now)).toBe(true);
  });

  // The boundary is what bounds the write rate: renewing a second early would mean a write
  // on every request for a whole second's worth of traffic rather than one per day.
  it("holds off at exactly the slide window", () => {
    const issuedAt = now - SESSION_SLIDE_AFTER_S;
    expect(shouldRenew(issuedAt + SESSION_TTL_S, now)).toBe(false);
  });

  it("renews an already-expired session rather than refusing to consider it", () => {
    // resolveSession deletes expired rows before asking, so this only documents that the
    // predicate itself has no opinion about the past.
    expect(shouldRenew(now - 1, now)).toBe(true);
  });
});
