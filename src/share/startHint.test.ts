import { describe, expect, it } from "vitest";
import { memoryStore } from "./storage";
import { START_HINT_KEY, dismissStartHint, startHintDismissed } from "./startHint";

describe("the start hint", () => {
  it("shows until it is put away, and stays away", () => {
    const store = memoryStore();
    expect(startHintDismissed(store)).toBe(false);
    dismissStartHint(store);
    expect(startHintDismissed(store)).toBe(true);
  });

  it("reads anything but true as not put away", () => {
    for (const raw of ["1", '"true"', "{}", "not json"]) {
      expect(startHintDismissed(memoryStore({ [START_HINT_KEY]: raw }))).toBe(false);
    }
  });

  it("shows where there is no storage at all", () => {
    expect(startHintDismissed(null)).toBe(false);
  });
});
