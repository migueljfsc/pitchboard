import { describe, expect, it } from "vitest";
import { SPORTS, sportOfDoc } from "./sports";
import { SPORT_IDS } from "../../src/board/types";

describe("the Worker's sports", () => {
  it("are the app's, in the same order", () => {
    expect([...SPORTS]).toEqual([...SPORT_IDS]);
  });

  it("read a document's sport, football where it names none", () => {
    expect(sportOfDoc('{"sport":"basketball"}')).toBe("basketball");
    expect(sportOfDoc('{"scenes":[]}')).toBe("football");
  });

  it("refuse a sport nobody plays here, and a document that is not one", () => {
    expect(sportOfDoc('{"sport":"curling"}')).toBeNull();
    expect(sportOfDoc("{not json")).toBeNull();
  });
});
