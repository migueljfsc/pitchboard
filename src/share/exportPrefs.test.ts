import { describe, expect, it } from "vitest";
import { memoryStore } from "./storage";
import { EXPORT_DEFAULTS, EXPORT_PREFS_KEY, loadExportPrefs, saveExportPrefs } from "./exportPrefs";

describe("export settings", () => {
  it("round-trips what was saved", () => {
    const store = memoryStore();
    const prefs = { ...EXPORT_DEFAULTS, format: "gif" as const, gifEdge: 1280, fps: 20, shape: "wide" as const };
    saveExportPrefs(prefs, store);
    expect(loadExportPrefs(store)).toEqual(prefs);
  });

  it("drops a field it cannot trust and keeps the rest", () => {
    const store = memoryStore({
      [EXPORT_PREFS_KEY]: JSON.stringify({ format: "webm", videoEdge: 777, bitrate: 16e6, json: "yes" }),
    });
    expect(loadExportPrefs(store)).toEqual({ ...EXPORT_DEFAULTS, format: "webm", bitrate: 16e6 });
  });

  it("will not keep a GIF size past the GIF ceiling", () => {
    const store = memoryStore({ [EXPORT_PREFS_KEY]: JSON.stringify({ format: "gif", gifEdge: 3840 }) });
    expect(loadExportPrefs(store).gifEdge).toBe(EXPORT_DEFAULTS.gifEdge);
  });

  it("reads a rate against the format it was chosen with", () => {
    const store = memoryStore({ [EXPORT_PREFS_KEY]: JSON.stringify({ format: "gif", fps: 60 }) });
    expect(loadExportPrefs(store).fps).toBe(25);
  });

  it("falls back to the defaults with nothing stored, or no store", () => {
    expect(loadExportPrefs(memoryStore())).toEqual(EXPORT_DEFAULTS);
    expect(loadExportPrefs(null)).toEqual(EXPORT_DEFAULTS);
    expect(loadExportPrefs(memoryStore({ [EXPORT_PREFS_KEY]: "not json" }))).toEqual(EXPORT_DEFAULTS);
  });
});
