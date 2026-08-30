import { describe, expect, it } from "vitest";

import {
  OAUTH_COOKIE,
  authorizeUrl,
  clearedOauthCookie,
  decodeJwtPayload,
  identityFromClaims,
  oauthCookie,
  parseOauthCookie,
  redirectUri,
  timingSafeEqual,
} from "./google";
import { readCookie } from "./session";

const CLIENT_ID = "client-123.apps.googleusercontent.com";

function jwtWith(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${b64}.signature`;
}

const validClaims = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "108423",
  email: "Coach@Example.com",
  email_verified: true,
  name: "A Coach",
};

describe("decodeJwtPayload", () => {
  it("round-trips a payload", () => {
    expect(decodeJwtPayload(jwtWith(validClaims))).toEqual(validClaims);
  });

  // A payload is base64url-encoded UTF-8. Decoding through atob alone mangles anything
  // outside latin1, which is most of the display names this will ever see.
  it("decodes non-ascii names correctly", () => {
    const claims = { ...validClaims, name: "José Mourinho — Ação" };
    expect(decodeJwtPayload(jwtWith(claims))).toEqual(claims);
  });

  it("rejects anything that is not three segments", () => {
    expect(() => decodeJwtPayload("a.b")).toThrow("malformed_id_token");
  });
});

describe("identityFromClaims", () => {
  it("accepts a well-formed token and lowercases the email", () => {
    expect(identityFromClaims(validClaims, CLIENT_ID)).toEqual({
      subject: "108423",
      email: "coach@example.com",
      displayName: "A Coach",
    });
  });

  it("accepts the bare issuer form Google also sends", () => {
    expect(() =>
      identityFromClaims({ ...validClaims, iss: "accounts.google.com" }, CLIENT_ID),
    ).not.toThrow();
  });

  it("rejects a token minted for another client", () => {
    expect(() => identityFromClaims({ ...validClaims, aud: "someone-else" }, CLIENT_ID)).toThrow(
      "bad_audience",
    );
  });

  it("rejects a foreign issuer", () => {
    expect(() => identityFromClaims({ ...validClaims, iss: "https://evil.test" }, CLIENT_ID)).toThrow(
      "bad_issuer",
    );
  });

  // Email is the key that links a Google identity to an existing password account, so an
  // unverified address is an account takeover rather than a cosmetic problem.
  it("rejects an unverified email", () => {
    expect(() => identityFromClaims({ ...validClaims, email_verified: false }, CLIENT_ID)).toThrow(
      "email_unverified",
    );
    expect(() =>
      identityFromClaims({ ...validClaims, email_verified: undefined }, CLIENT_ID),
    ).toThrow("email_unverified");
  });

  it("accepts the stringified form of the verified claim", () => {
    expect(() =>
      identityFromClaims({ ...validClaims, email_verified: "true" }, CLIENT_ID),
    ).not.toThrow();
  });

  it("tolerates a missing name", () => {
    expect(identityFromClaims({ ...validClaims, name: undefined }, CLIENT_ID).displayName).toBeNull();
  });
});

describe("the oauth scratch cookie", () => {
  it("round-trips state and verifier", () => {
    const header = oauthCookie("st-ate", "veri-fier");
    const value = readCookie(header.split(";")[0], OAUTH_COOKIE);
    expect(parseOauthCookie(value)).toEqual({ state: "st-ate", verifier: "veri-fier" });
  });

  // Strict would withhold the cookie on the top-level navigation back from Google, which is
  // the one request that needs it, so every sign-in would fail its own state check.
  it("is SameSite=Lax and scoped to the callback path", () => {
    const header = oauthCookie("a", "b");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/api/auth/google");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
  });

  it("rejects malformed values rather than guessing", () => {
    expect(parseOauthCookie(null)).toBeNull();
    expect(parseOauthCookie("nodot")).toBeNull();
    expect(parseOauthCookie(".leading")).toBeNull();
    expect(parseOauthCookie("trailing.")).toBeNull();
  });

  it("clears with Max-Age=0 on the same path, or the browser keeps the old one", () => {
    expect(clearedOauthCookie()).toContain("Max-Age=0");
    expect(clearedOauthCookie()).toContain("Path=/api/auth/google");
  });
});

describe("timingSafeEqual", () => {
  it("matches equal strings and rejects differences anywhere", () => {
    expect(timingSafeEqual("abcdef", "abcdef")).toBe(true);
    expect(timingSafeEqual("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeEqual("abcdef", "zbcdef")).toBe(false);
    expect(timingSafeEqual("abcdef", "abcde")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("authorizeUrl", () => {
  it("carries the parameters Google needs, and no sensitive scope", async () => {
    const url = new URL(await authorizeUrl(CLIENT_ID, "https://x.test", "st", "ver"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/api/auth/google/callback");
  });

  // The challenge is the SHA-256 of the verifier, never the verifier itself — sending the
  // latter would make PKCE a no-op.
  it("sends a challenge that is not the verifier", async () => {
    const url = new URL(await authorizeUrl(CLIENT_ID, "https://x.test", "st", "ver"));
    const challenge = url.searchParams.get("code_challenge");
    expect(challenge).not.toBe("ver");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("derives the callback from the origin it was called on", () => {
    expect(redirectUri("https://pitchboard.example")).toBe(
      "https://pitchboard.example/api/auth/google/callback",
    );
  });
});
