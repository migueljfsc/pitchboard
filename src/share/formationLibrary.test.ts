import { describe, expect, it } from "vitest";

import { createBoardDoc, shapeOf } from "@/formations";
import {
  FORMATIONS_KEY,
  MAX_FORMATIONS,
  MAX_FORMATION_NAME,
  addFormation,
  customFormation,
  deleteFormation,
  formationFromRow,
  formationLibraryFromRows,
  formationsOf,
  loadFormations,
  renameFormation,
  sameName,
  saveFormations,
  serialiseFormation,
} from "./formationLibrary";
import { memoryStore } from "./storage";

const shape = (name = "Wide") => shapeOf(createBoardDoc(), 0, 0, name);

describe("the formation library (D122)", () => {
  it("round-trips through the browser's storage", () => {
    const store = memoryStore();
    const list = [customFormation(shape(), "football", []), customFormation(shape("Tight"), "futsal", [])];
    expect(saveFormations(list, store)).toBe(true);
    expect(loadFormations(store)).toEqual(list);
  });

  it("discards a stored library that no longer validates rather than repairing it (D31)", () => {
    const store = memoryStore({ [FORMATIONS_KEY]: JSON.stringify([{ id: "x", shape: { name: "", slots: [] } }]) });
    expect(loadFormations(store)).toEqual([]);
  });

  it("round-trips through an account row, the row's name and id winning", () => {
    const entry = customFormation(shape(), "basketball", []);
    const body = serialiseFormation(entry);
    expect(JSON.parse(body).shape.name).toBeUndefined();
    const back = formationFromRow({ id: "row-1", name: "Renamed", body });
    expect(back?.id).toBe("row-1");
    expect(back?.shape.name).toBe("Renamed");
    expect(back?.sport).toBe("basketball");
    expect(back?.shape.slots).toEqual(entry.shape.slots);
  });

  it("drops a bad row and keeps the rest", () => {
    const good = { id: "a", name: "Wide", body: serialiseFormation(customFormation(shape(), "football", [])) };
    expect(formationLibraryFromRows([good, { id: "b", name: "Bad", body: "{not json" }])).toHaveLength(1);
  });

  it("matches a save by name within a sport, trimmed and case-blind", () => {
    const list = [customFormation(shape("Wide"), "football", []), { ...customFormation(shape("Wide"), "futsal", []), id: "shape-9" }];
    expect(sameName(list, "  wide ", "football")?.id).toBe(list[0].id);
    expect(sameName(list, "Wide", "futsal")?.id).toBe("shape-9");
    expect(sameName(list, "Wide", "handball")).toBeNull();
    expect(formationsOf(list, "futsal")).toHaveLength(1);
  });

  // `MAX_FORMATION_NAME_CHARS` in the Worker is forty as well; its own test holds it there.
  it("names no longer than the schema allows", () => {
    expect(MAX_FORMATION_NAME).toBe(40);
    expect(customFormation(shape("x".repeat(60)), "football", []).shape.name).toHaveLength(40);
  });

  it("is capped, and renames and deletes by id", () => {
    let list: ReturnType<typeof loadFormations> = [];
    for (let i = 0; i < MAX_FORMATIONS + 5; i++) list = addFormation(list, customFormation(shape(`S${i}`), "football", list));
    expect(list).toHaveLength(MAX_FORMATIONS);
    const id = list[0].id;
    expect(renameFormation(list, id, "  New  ")[0].shape.name).toBe("New");
    expect(deleteFormation(list, id).some((f) => f.id === id)).toBe(false);
  });
});
