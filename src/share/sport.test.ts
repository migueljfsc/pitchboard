import { describe, expect, it } from "vitest";
import { memoryStore } from "./storage";
import { SPORT_KEY, loadSport, saveSport } from "./sport";

describe("the sport a new board starts in", () => {
  it("round-trips what was chosen", () => {
    const store = memoryStore();
    saveSport("basketball", store);
    expect(loadSport(store)).toBe("basketball");
  });

  it("is football when nothing, or nothing it knows, is stored", () => {
    expect(loadSport(memoryStore())).toBe("football");
    expect(loadSport(null)).toBe("football");
    expect(loadSport(memoryStore({ [SPORT_KEY]: JSON.stringify("curling") }))).toBe("football");
  });
});
