import { describe, expect, it } from "vitest";
import { displayName, setPlayerLabel, setPlayerNumber, teamOf } from "./players";
import { createLink } from "./links";
import { createBoardDoc } from "@/formations";
import { boardDocSchema } from "./schema";

const A = "home-9";
const B = "home-10";

describe("displayName", () => {
  it("falls back to the shirt number until a player is named", () => {
    const doc = createBoardDoc();
    expect(displayName(doc, A)).toBe("9");
    expect(displayName(setPlayerLabel(doc, A, "Haaland"), A)).toBe("Haaland");
  });

  it("ignores a whitespace-only label", () => {
    const doc = setPlayerLabel(createBoardDoc(), A, "   ");
    expect(displayName(doc, A)).toBe("9");
  });

  it("returns the id for someone who is not in a squad", () => {
    expect(displayName(createBoardDoc(), "ghost")).toBe("ghost");
  });
});

describe("setPlayerLabel", () => {
  it("renames without disturbing positions, paths or identity", () => {
    const doc = createBoardDoc();
    const next = setPlayerLabel(doc, A, "Ødegaard");
    expect(next.teams[0].players.find((p) => p.id === A)!.label).toBe("Ødegaard");
    expect(next.scenes[0].positions).toEqual(doc.scenes[0].positions);
    expect(boardDocSchema.safeParse(next).success).toBe(true);
  });

  it("does not mutate the original", () => {
    const doc = createBoardDoc();
    const before = structuredClone(doc);
    setPlayerLabel(doc, A, "Rice");
    expect(doc).toEqual(before);
  });

  it("caps at the length the schema accepts", () => {
    const doc = setPlayerLabel(createBoardDoc(), A, "x".repeat(200));
    expect(doc.teams[0].players.find((p) => p.id === A)!.label).toHaveLength(40);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("is a no-op for an unknown player", () => {
    const doc = createBoardDoc();
    expect(setPlayerLabel(doc, "ghost", "x")).toBe(doc);
  });
});

describe("setPlayerNumber", () => {
  it("clamps and rounds into the legal range", () => {
    const doc = createBoardDoc();
    const numberOf = (d: typeof doc) => d.teams[0].players.find((p) => p.id === A)!.number;
    expect(numberOf(setPlayerNumber(doc, A, -5))).toBe(0);
    expect(numberOf(setPlayerNumber(doc, A, 1000))).toBe(99);
    expect(numberOf(setPlayerNumber(doc, A, 23.6))).toBe(24);
  });

  it("rejects a non-finite number rather than corrupting the document", () => {
    const doc = createBoardDoc();
    expect(setPlayerNumber(doc, A, NaN)).toBe(doc);
  });
});

describe("teamOf", () => {
  it("finds the owning team, or null", () => {
    const doc = createBoardDoc();
    expect(teamOf(doc, A)?.id).toBe("home");
    expect(teamOf(doc, "away-9")?.id).toBe("away");
    expect(teamOf(doc, "ghost")).toBeNull();
  });
});

describe("links are named after their members", () => {
  it("uses shirt numbers before anyone is named, in squad order", () => {
    const doc = createLink(createBoardDoc(), [A, B]);
    // 10 is a midfielder and 9 a forward, so 10 comes first in the squad.
    expect(doc.links[doc.links.length - 1].name).toBe("10, 9");
  });

  it("uses names once given, in link order", () => {
    let doc = createBoardDoc();
    doc = setPlayerLabel(doc, A, "Havertz");
    doc = setPlayerLabel(doc, B, "Ødegaard");
    doc = createLink(doc, [A, B]);
    // Squad order, not click order — 10 is listed before 9 in a 4-3-3 midfield.
    expect(doc.links[doc.links.length - 1].name).toBe("Ødegaard, Havertz");
  });

  it("still honours an explicit name", () => {
    const doc = createLink(createBoardDoc(), [A, B], { name: "Press trap" });
    expect(doc.links[doc.links.length - 1].name).toBe("Press trap");
  });
});
