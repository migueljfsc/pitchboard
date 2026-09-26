import { describe, expect, it } from "vitest";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import type { BoardDoc } from "./types";

/** A fresh board with one edit applied. */
const edited = (edit: (doc: BoardDoc) => void): BoardDoc => {
  const doc = structuredClone(createBoardDoc());
  edit(doc);
  return doc;
};
const p0 = (doc: BoardDoc) => doc.teams[0].players[0].id;

describe("boardDocSchema", () => {
  it("round-trips a fresh board through JSON unchanged", () => {
    const doc = createBoardDoc();
    expect(boardDocSchema.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  // Every optional field's absence is the old behaviour, so the bounds are what matter.
  it.each<[string, (doc: BoardDoc) => void]>([
    ["a scene with no ball at all — a board starts without one", () => {}],
    ["the smallest player size", (d) => void (d.tokenScale = 0.5)],
    ["the largest player size", (d) => void (d.tokenScale = 2.5)],
    ["a shaded grass", (d) => void (d.grass = { shade: -0.4, texture: "natural" })],
  ])("accepts %s", (_, edit) => {
    expect(boardDocSchema.safeParse(edited(edit)).success).toBe(true);
  });

  // Each of these renders wrong rather than crashing, which is why the validator owns them.
  it.each<[string, (doc: BoardDoc) => void]>([
    ["a scene missing a player position", (d) => void delete d.scenes[0].positions[p0(d)]],
    ["a path for an entity with no position", (d) => {
      d.scenes[0].paths["nobody"] = { c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 } };
    }],
    ["a carrier that is not a player", (d) => void (d.scenes[0].carrier = "ghost")],
    ["a scene that both holds the ball and stores its position", (d) => {
      d.scenes[0].carrier = p0(d);
      d.scenes[0].ballPos = { x: 52.5, y: 34 };
    }],
    ["a link member that is not a player", (d) => void d.links[0].members.push("ghost")],
    ["a link with fewer than two members", (d) => void (d.links[0].members = [d.links[0].members[0]])],
    ["duplicate player ids across teams", (d) => {
      d.teams[1].players[0] = { ...d.teams[1].players[0], id: p0(d) };
    }],
    ["an empty scene list", (d) => void (d.scenes = [])],
    ["a version it does not know", (d) => void ((d as { version: number }).version = 2)],
    ["a non-finite coordinate", (d) => void (d.scenes[0].positions[p0(d)] = { x: NaN, y: 0 })],
    ["a player size out of range", (d) => void (d.tokenScale = 9)],
    ["a grass shade out of range", (d) => void (d.grass = { shade: 2 })],
    ["a flow pace of nothing", (d) => void (d.flow = { speed: 0, endHoldMs: 0 })],
    ["a flow pace beyond any sprinter", (d) => void (d.flow = { speed: 99, endHoldMs: 0 })],
    ["a label alignment it does not know", (d) => {
      d.annotations = [{
        id: "t", kind: "text", color: "#fff", from: d.scenes[0].id, to: null,
        at: { x: 50, y: 30 }, text: "x", align: "justify" as "left",
      }];
    }],
  ])("rejects %s", (_, edit) => {
    expect(boardDocSchema.safeParse(edited(edit)).success).toBe(false);
  });
});
