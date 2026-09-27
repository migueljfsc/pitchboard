import { describe, expect, it } from "vitest";
import { headersFile, SECURITY_HEADERS } from "./headers";
import { secured } from "./http";

describe("security headers", () => {
  it("forbid framing, so the sign-in cannot be clickjacked", () => {
    expect(SECURITY_HEADERS["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("are set on a response whose headers are immutable, keeping its own", () => {
    const out = secured(Response.redirect("https://pitchboard.example/", 302));
    expect(out.status).toBe(302);
    expect(out.headers.get("location")).toBe("https://pitchboard.example/");
    expect(out.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("reach static assets as one rule for every path", () => {
    expect(headersFile({ "x-a": "1", "x-b": "2" })).toBe("/*\n  x-a: 1\n  x-b: 2\n");
  });
});
