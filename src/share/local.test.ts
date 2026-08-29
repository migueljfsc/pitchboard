import { describe, expect, it } from "vitest";
import { createBoardDoc } from "@/formations";
import { addSceneAfter } from "@/board/scenes";
import { memoryStore } from "./storage";
import { BOARD_KEY, clearBoard, loadBoard, saveBoard } from "./local";

describe("board autosave", () => {
  it("round-trips a board deep-equal", () => {
    const store = memoryStore();
    const doc = addSceneAfter(createBoardDoc(), 0);
    expect(saveBoard(doc, store)).toBe(true);
    expect(loadBoard(store)).toEqual(doc);
  });

  it("is null when nothing has been saved", () => {
    expect(loadBoard(memoryStore())).toBeNull();
  });

  it("is null when there is no store", () => {
    expect(loadBoard(null)).toBeNull();
    expect(saveBoard(createBoardDoc(), null)).toBe(false);
  });

  it("discards a board the schema rejects rather than opening it", () => {
    // The shape a previous app version might have left behind.
    const store = memoryStore({ [BOARD_KEY]: JSON.stringify({ version: 1, teams: [] }) });
    expect(loadBoard(store)).toBeNull();
  });

  it("discards malformed JSON", () => {
    expect(loadBoard(memoryStore({ [BOARD_KEY]: "half a {" }))).toBeNull();
  });

  it("clears", () => {
    const store = memoryStore();
    saveBoard(createBoardDoc(), store);
    clearBoard(store);
    expect(loadBoard(store)).toBeNull();
  });

  it("never throws when the store is hostile", () => {
    const angry = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => loadBoard(angry)).not.toThrow();
    expect(() => clearBoard(angry)).not.toThrow();
    expect(loadBoard(angry)).toBeNull();
    expect(saveBoard(createBoardDoc(), angry)).toBe(false);
  });
});
