import { describe, expect, it } from "vitest";
import { memoryStore } from "./storage";
import { TOUR_KEY, TOUR_VERSION, markTourSeen, tourSeen } from "./tour";

describe("editor tour", () => {
  it("shows until it is seen, and stays seen", () => {
    const store = memoryStore();
    expect(tourSeen(store)).toBe(false);
    expect(markTourSeen(store)).toBe(true);
    expect(tourSeen(store)).toBe(true);
  });

  it("shows again to whoever saw an earlier version", () => {
    expect(tourSeen(memoryStore({ [TOUR_KEY]: String(TOUR_VERSION - 1) }))).toBe(false);
    expect(tourSeen(memoryStore({ [TOUR_KEY]: String(TOUR_VERSION + 1) }))).toBe(true);
  });

  it("shows when what is stored is not a whole number", () => {
    expect(tourSeen(memoryStore({ [TOUR_KEY]: "true" }))).toBe(false);
    expect(tourSeen(memoryStore({ [TOUR_KEY]: "1.5" }))).toBe(false);
    expect(tourSeen(memoryStore({ [TOUR_KEY]: "{not json" }))).toBe(false);
  });

  it("ignores the old one-line tip, so everybody who closed it sees the tour once", () => {
    expect(tourSeen(memoryStore({ "pitchboard:tip-dismissed": "true" }))).toBe(false);
  });

  it("shows, and does not throw, with no store at all", () => {
    expect(tourSeen(null)).toBe(false);
    expect(markTourSeen(null)).toBe(false);
  });
});
