import { describe, expect, it } from "vitest";
import { memoryStore } from "./storage";
import { TIP_KEY, dismissTip, tipDismissed } from "./tips";

describe("first-run tip", () => {
  it("shows until it is dismissed, and stays dismissed", () => {
    const store = memoryStore();
    expect(tipDismissed(store)).toBe(false);
    expect(dismissTip(store)).toBe(true);
    expect(tipDismissed(store)).toBe(true);
  });

  it("shows again when what is stored is anything but true", () => {
    expect(tipDismissed(memoryStore({ [TIP_KEY]: '"yes"' }))).toBe(false);
    expect(tipDismissed(memoryStore({ [TIP_KEY]: "{not json" }))).toBe(false);
  });

  it("shows, and does not throw, with no store at all", () => {
    expect(tipDismissed(null)).toBe(false);
    expect(dismissTip(null)).toBe(false);
  });
});
