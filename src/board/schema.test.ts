import { describe, expect, it } from "vitest";
import { boardDocSchema, parseBoardDoc } from "./schema";
import { createBoardDoc } from "@/formations";
import type { BoardDoc } from "./types";

const clone = (d: BoardDoc): BoardDoc => structuredClone(d);

describe("boardDocSchema", () => {
  it("accepts a freshly created board", () => {
    expect(() => parseBoardDoc(createBoardDoc())).not.toThrow();
  });

  it("round-trips through JSON unchanged", () => {
    const doc = createBoardDoc();
    expect(parseBoardDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("rejects a scene missing a player position", () => {
    const doc = clone(createBoardDoc());
    delete doc.scenes[0].positions[doc.teams[0].players[0].id];
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a path referencing an entity with no position", () => {
    const doc = clone(createBoardDoc());
    doc.scenes[0].paths["nobody"] = { c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 } };
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a carrier that is not a player", () => {
    const doc = clone(createBoardDoc());
    doc.scenes[0].carrier = "ghost";
    delete doc.scenes[0].ballPos;
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("requires ballPos exactly when there is no carrier", () => {
    const withCarrier = clone(createBoardDoc());
    withCarrier.scenes[0].carrier = withCarrier.teams[0].players[0].id;
    // ballPos left in place alongside a carrier — contradictory.
    expect(boardDocSchema.safeParse(withCarrier).success).toBe(false);

    const loose = clone(createBoardDoc());
    delete loose.scenes[0].ballPos;
    expect(boardDocSchema.safeParse(loose).success).toBe(false);
  });

  it("rejects a link member that is not a player", () => {
    const doc = clone(createBoardDoc());
    doc.links[0].members = [...doc.links[0].members, "ghost"];
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a link with fewer than two members", () => {
    const doc = clone(createBoardDoc());
    doc.links[0].members = [doc.links[0].members[0]];
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects duplicate player ids across teams", () => {
    const doc = clone(createBoardDoc());
    doc.teams[1].players[0] = { ...doc.teams[1].players[0], id: doc.teams[0].players[0].id };
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects an empty scene list and a wrong version", () => {
    const noScenes = clone(createBoardDoc());
    noScenes.scenes = [];
    expect(boardDocSchema.safeParse(noScenes).success).toBe(false);

    const badVersion = { ...clone(createBoardDoc()), version: 2 };
    expect(boardDocSchema.safeParse(badVersion).success).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    const doc = clone(createBoardDoc());
    doc.scenes[0].positions[doc.teams[0].players[0].id] = { x: NaN, y: 0 };
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });
});
