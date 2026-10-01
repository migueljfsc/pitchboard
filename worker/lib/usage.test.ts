import { describe, expect, it } from "vitest";

import { USAGE_EVENTS, usageDay, usageEvent } from "./usage";
import { USAGE_EVENTS as APP_EVENTS } from "../../src/share/usageEvents";

describe("the Worker's events", () => {
  it("are the app's, in the same order", () => {
    expect([...USAGE_EVENTS]).toEqual([...APP_EVENTS]);
  });
});

describe("usageEvent", () => {
  it("admits every listed event", () => {
    for (const event of USAGE_EVENTS) expect(usageEvent(event)).toBe(event);
  });

  // The endpoint is the Worker's one unauthenticated write: anything off the list is a row
  // nobody asked for.
  it("refuses anything else", () => {
    expect(usageEvent("page.admin")).toBeNull();
    expect(usageEvent("")).toBeNull();
    expect(usageEvent(undefined)).toBeNull();
    expect(usageEvent(["page.editor"])).toBeNull();
    expect(usageEvent({ event: "page.editor" })).toBeNull();
  });
});

describe("usageDay", () => {
  it("is the UTC date, so a day's row does not depend on where the Worker ran", () => {
    expect(usageDay(Date.UTC(2026, 9, 1, 23, 59, 59) / 1000)).toBe("2026-10-01");
    expect(usageDay(Date.UTC(2026, 9, 2, 0, 0, 0) / 1000)).toBe("2026-10-02");
  });
});
