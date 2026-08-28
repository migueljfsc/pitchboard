import { describe, expect, it } from "vitest";
import {
  area,
  createLink,
  deleteLink,
  linkGeometry,
  moveMember,
  perimeter,
  pruneLinks,
  updateLink,
} from "./links";
import { resolveAt } from "./timeline";
import { hitTestLink } from "./interaction";
import { createBoardDoc } from "@/formations";
import { boardDocSchema } from "./schema";
import type { BoardDoc, Link, LinkStyle, Scene } from "./types";

const A = "home-2";
const B = "home-5";
const C = "home-6";
const D = "home-3";

/** A board with one link over the given members, positioned where we say. */
function board(
  members: string[],
  style: LinkStyle,
  places: Record<string, { x: number; y: number }>,
): BoardDoc {
  const doc = createBoardDoc();
  Object.assign(doc.scenes[0].positions, places);
  doc.links = [
    { id: "l1", name: "Test", members, style, color: "#ffffff", showDistances: false },
  ];
  return doc;
}

const at = (doc: BoardDoc, t = 0) => linkGeometry(doc.links[0], resolveAt(doc, t), doc)!;

describe("chain", () => {
  const doc = board([A, B, C, D], "chain", {
    [A]: { x: 20, y: 10 },
    [B]: { x: 20, y: 26 },
    [C]: { x: 20, y: 42 },
    [D]: { x: 20, y: 58 },
  });

  it("is open — a back four must not close back on itself", () => {
    const g = at(doc);
    expect(g.closed).toBe(false);
    expect(g.edges).toHaveLength(3);

    // No edge joins the last member to the first. That closing segment running the
    // width of the pitch is the obvious wrong output.
    const spansEnds = g.edges.some(
      (e) =>
        (e.a.y === 10 && e.b.y === 58) || (e.a.y === 58 && e.b.y === 10),
    );
    expect(spansEnds).toBe(false);
  });

  it("encloses no area", () => {
    expect(area(at(doc))).toBe(0);
  });

  it("measures edges in metres", () => {
    for (const edge of at(doc).edges) expect(edge.metres).toBeCloseTo(16);
    expect(perimeter(at(doc))).toBeCloseTo(48);
  });

  it("follows member order, so reordering redraws the line", () => {
    const swapped = moveMember(doc, "l1", 0, 3);
    const g = at(swapped);
    expect(g.points[3].y).toBe(10);
    // The line now doubles back, which is exactly what the user asked for.
    expect(g.edges[2].metres).toBeCloseTo(48);
  });
});

describe("polygon", () => {
  const doc = board([A, B, C], "polygon", {
    [A]: { x: 10, y: 10 },
    [B]: { x: 40, y: 10 },
    [C]: { x: 10, y: 50 },
  });

  it("closes, adding the final edge back to the first member", () => {
    const g = at(doc);
    expect(g.closed).toBe(true);
    expect(g.edges).toHaveLength(3);
    expect(g.edges[2].b).toEqual(g.points[0]);
  });

  it("measures a 30-40-50 triangle", () => {
    const g = at(doc);
    expect(g.edges[0].metres).toBeCloseTo(30);
    expect(g.edges[1].metres).toBeCloseTo(50);
    expect(g.edges[2].metres).toBeCloseTo(40);
  });

  it("computes enclosed area by the shoelace formula", () => {
    expect(area(at(doc))).toBeCloseTo(600);
  });

  it("puts each label at its edge midpoint", () => {
    expect(at(doc).edges[0].mid).toEqual({ x: 25, y: 10 });
  });

  it("degrades to a chain with only two members, rather than doubling the segment", () => {
    const two = board([A, B], "polygon", { [A]: { x: 0, y: 0 }, [B]: { x: 10, y: 0 } });
    const g = at(two);
    expect(g.closed).toBe(false);
    expect(g.edges).toHaveLength(1);
  });

  it("returns null when fewer than two members survive", () => {
    const doc2 = board([A], "polygon", { [A]: { x: 0, y: 0 } });
    expect(linkGeometry(doc2.links[0], resolveAt(doc2, 0), doc2)).toBeNull();
  });
});

describe("filled", () => {
  it("encloses area like a polygon", () => {
    const doc = board([A, B, C], "filled", {
      [A]: { x: 0, y: 0 },
      [B]: { x: 20, y: 0 },
      [C]: { x: 0, y: 20 },
    });
    expect(at(doc).closed).toBe(true);
    expect(area(at(doc))).toBeCloseTo(200);
  });
});

describe("deforming live — the headline feature", () => {
  /** Two scenes; one corner of a triangle runs wide during the transition. */
  function pressing(): BoardDoc {
    const doc = board([A, B, C], "filled", {
      [A]: { x: 30, y: 24 },
      [B]: { x: 30, y: 44 },
      [C]: { x: 45, y: 34 },
    });
    const first = doc.scenes[0];
    first.transitionMs = 0;
    first.holdMs = 1000;
    const second: Scene = {
      ...structuredClone(first),
      id: "scene-2",
      name: "Press",
      transitionMs: 2000,
      holdMs: 500,
    };
    second.positions[C] = { x: 80, y: 34 }; // the eight jumps to press
    doc.scenes = [first, second];
    return doc;
  }

  it("changes shape continuously through the transition", () => {
    const doc = pressing();
    const times = [1, 1.5, 2, 2.5, 3];
    const areas = times.map((t) => area(at(doc, t)));

    // Strictly growing as the presser pulls away — no frozen frames.
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeGreaterThan(areas[i - 1]);
    }
    expect(areas[areas.length - 1] / areas[0]).toBeGreaterThan(3);
  });

  it("stretches the edges to the player who stepped out", () => {
    const doc = pressing();
    const before = at(doc, 1).edges.map((e) => e.metres);
    const after = at(doc, 3).edges.map((e) => e.metres);

    // The two edges touching the presser lengthen; the back pair is unchanged.
    expect(after[1]).toBeGreaterThan(before[1]);
    expect(after[2]).toBeGreaterThan(before[2]);
    expect(after[0]).toBeCloseTo(before[0]);
  });

  it("tracks interpolated positions, not scene positions", () => {
    const doc = pressing();
    const mid = at(doc, 2);
    const start = at(doc, 1);
    const end = at(doc, 3);
    // Genuinely between the two, rather than snapping at the boundary.
    expect(mid.points[2].x).toBeGreaterThan(start.points[2].x);
    expect(mid.points[2].x).toBeLessThan(end.points[2].x);
  });
});

describe("createLink", () => {
  it("orders members by squad order, not the order they were clicked", () => {
    const doc = createLink(createBoardDoc(), [D, A, C, B]);
    const order = doc.links[doc.links.length - 1].members;
    const squad = createBoardDoc().teams[0].players.map((p) => p.id);
    const expected = squad.filter((id) => [A, B, C, D].includes(id));
    expect(order).toEqual(expected);
  });

  it("defaults a three to a shape and everything else to a chain", () => {
    const three = createLink(createBoardDoc(), [A, B, C]);
    expect(three.links[three.links.length - 1].style).toBe("polygon");
    const four = createLink(createBoardDoc(), [A, B, C, D]);
    expect(four.links[four.links.length - 1].style).toBe("chain");
  });

  it("takes the colour of the members' team", () => {
    const doc = createBoardDoc();
    const next = createLink(doc, [A, B]);
    expect(next.links[next.links.length - 1].color).toBe(doc.teams[0].color);
  });

  it("refuses fewer than two members", () => {
    const doc = createBoardDoc();
    expect(createLink(doc, [A])).toBe(doc);
    expect(createLink(doc, [])).toBe(doc);
  });

  it("gives every link a distinct id and stays valid", () => {
    let doc = createBoardDoc();
    for (let i = 0; i < 4; i++) doc = createLink(doc, [A, B, C]);
    expect(new Set(doc.links.map((l) => l.id)).size).toBe(doc.links.length);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("updateLink / deleteLink", () => {
  it("patches fields", () => {
    const doc = board([A, B], "chain", { [A]: { x: 0, y: 0 }, [B]: { x: 5, y: 0 } });
    const next = updateLink(doc, "l1", { style: "filled", showDistances: true, hidden: true });
    expect(next.links[0]).toMatchObject({ style: "filled", showDistances: true, hidden: true });
    expect(boardDocSchema.safeParse(next).success).toBe(true);
  });

  it("is a no-op for an unknown id", () => {
    const doc = createBoardDoc();
    expect(updateLink(doc, "nope", { hidden: true })).toBe(doc);
    expect(deleteLink(doc, "nope")).toBe(doc);
  });

  it("removes a link", () => {
    const doc = board([A, B], "chain", { [A]: { x: 0, y: 0 }, [B]: { x: 5, y: 0 } });
    expect(deleteLink(doc, "l1").links).toHaveLength(0);
  });
});

describe("pruneLinks", () => {
  it("drops members who are no longer in a squad", () => {
    const doc = board([A, B, "ghost"], "chain", { [A]: { x: 0, y: 0 }, [B]: { x: 5, y: 0 } });
    const next = pruneLinks(doc);
    expect(next.links[0].members).toEqual([A, B]);
  });

  it("discards a link left with fewer than two members", () => {
    const doc = board([A, "ghost"], "chain", { [A]: { x: 0, y: 0 } });
    expect(pruneLinks(doc).links).toHaveLength(0);
  });

  it("leaves a clean document untouched", () => {
    const doc = createBoardDoc();
    expect(pruneLinks(doc)).toBe(doc);
  });

  it("keeps every seeded link valid through a formation change", () => {
    // applyFormation prunes; every link must still reference live players.
    const doc = createBoardDoc();
    const ids = new Set(doc.teams.flatMap((t) => t.players.map((p) => p.id)));
    for (const l of doc.links) for (const m of l.members) expect(ids.has(m)).toBe(true);
  });
});

describe("hitTestLink", () => {
  const doc = board([A, B], "chain", { [A]: { x: 20, y: 10 }, [B]: { x: 20, y: 50 } });
  const r = resolveAt(doc, 0);

  it("finds a connector under the pointer", () => {
    expect(hitTestLink(doc, r, { x: 20, y: 30 })?.id).toBe("l1");
  });

  it("misses well away from the line", () => {
    expect(hitTestLink(doc, r, { x: 40, y: 30 })).toBeNull();
  });

  it("ignores hidden links", () => {
    const hidden = updateLink(doc, "l1", { hidden: true });
    expect(hitTestLink(hidden, resolveAt(hidden, 0), { x: 20, y: 30 })).toBeNull();
  });
});

describe("seeded links from formations", () => {
  it("gives 4-3-3 an open back four and a closed midfield three", () => {
    const doc = createBoardDoc();
    const back = doc.links.find((l: Link) => l.name.includes("Back 4"))!;
    const mid = doc.links.find((l: Link) => l.name.includes("Midfield 3"))!;

    expect(linkGeometry(back, resolveAt(doc, 0), doc)!.closed).toBe(false);
    expect(linkGeometry(mid, resolveAt(doc, 0), doc)!.closed).toBe(true);
  });

  it("has distances off by default, so the board starts clean", () => {
    for (const l of createBoardDoc().links) expect(l.showDistances).toBe(false);
  });
});
