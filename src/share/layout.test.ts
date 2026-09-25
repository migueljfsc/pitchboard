import { describe, expect, it } from "vitest";
import { memoryStore } from "./storage";
import { LAYOUT_KEY, SIDEBAR_DEFAULT, SIDEBAR_MAX, clampSidebar, loadLayout, saveLayout } from "./layout";

describe("sidebar layout", () => {
  it("round-trips what was saved", () => {
    const store = memoryStore();
    saveLayout({ left: 300, right: 340 }, store);
    expect(loadLayout(store)).toEqual({ left: 300, right: 340 });
  });

  it("falls back to the default for anything it cannot trust", () => {
    const store = memoryStore({ [LAYOUT_KEY]: JSON.stringify({ left: 9999, right: "wide" }) });
    expect(loadLayout(store)).toEqual({ left: SIDEBAR_DEFAULT, right: SIDEBAR_DEFAULT });
    expect(loadLayout(null)).toEqual({ left: SIDEBAR_DEFAULT, right: SIDEBAR_DEFAULT });
  });

  it("keeps a width in range", () => {
    expect(clampSidebar(10)).toBe(224);
    expect(clampSidebar(1e6)).toBe(SIDEBAR_MAX);
  });
});
