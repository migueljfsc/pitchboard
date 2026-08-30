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

  it("rejects a scene that both holds the ball and stores its position", () => {
    const doc = clone(createBoardDoc());
    doc.scenes[0].carrier = doc.teams[0].players[0].id;
    doc.scenes[0].ballPos = { x: 52.5, y: 34 };
    expect(boardDocSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts a scene with no ball at all — a board starts without one", () => {
    const doc = clone(createBoardDoc());
    expect(doc.scenes[0].carrier).toBeNull();
    expect(doc.scenes[0].ballPos).toBeUndefined();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
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
