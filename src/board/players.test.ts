import { describe, expect, it } from "vitest";
import {
  MAX_SQUAD,
  addPlayer,
  displayName,
  removePlayer,
  setPlayerLabel,
  setPlayerNumber,
  shirtClash,
  teamOf,
} from "./players";
import { setCarrier, setHighlight, setPath, setTravel } from "./scenes";
import { createLink } from "./links";
import { createBoardDoc } from "@/formations";
import { boardDocSchema } from "./schema";
import type { BoardDoc } from "./types";

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

describe("addPlayer", () => {
  it("adds to the right team with the next free shirt number", () => {
    const doc = addPlayer(createBoardDoc(), 0);
    expect(doc.teams[0].players).toHaveLength(12);
    expect(doc.teams[1].players).toHaveLength(11);
    // 1-11 are worn in a starting eleven.
    expect(doc.teams[0].players.at(-1)!.number).toBe(12);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("reuses a number freed by a departure", () => {
    let doc = createBoardDoc();
    const seven = doc.teams[0].players.find((p) => p.number === 7)!.id;
    doc = removePlayer(doc, seven);
    doc = addPlayer(doc, 0);
    expect(doc.teams[0].players.at(-1)!.number).toBe(7);
  });

  it("gives a position in EVERY scene, not just the current one", () => {
    let doc = createBoardDoc();
    doc = { ...doc, scenes: [doc.scenes[0], { ...structuredClone(doc.scenes[0]), id: "s2" }] };
    doc = addPlayer(doc, 1);

    const added = doc.teams[1].players.at(-1)!.id;
    for (const scene of doc.scenes) expect(scene.positions[added]).toBeDefined();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("does not drop a new player on top of anyone", () => {
    let doc = createBoardDoc();
    for (let i = 0; i < 6; i++) doc = addPlayer(doc, 0);

    const spots = Object.values(doc.scenes[0].positions);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThan(2.2);
      }
    }
  });

  it("gives every player a unique id even after churn", () => {
    let doc = createBoardDoc();
    doc = removePlayer(doc, "home-3");
    doc = addPlayer(doc, 0);
    doc = addPlayer(doc, 0);
    const ids = doc.teams.flatMap((t) => t.players.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses to exceed the squad cap", () => {
    let doc = createBoardDoc();
    while (doc.teams[0].players.length < MAX_SQUAD) doc = addPlayer(doc, 0);
    expect(doc.teams[0].players).toHaveLength(MAX_SQUAD);
    expect(addPlayer(doc, 0)).toBe(doc);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("removePlayer", () => {
  it("clears them from every scene", () => {
    let doc = createBoardDoc();
    doc = { ...doc, scenes: [doc.scenes[0], { ...structuredClone(doc.scenes[0]), id: "s2" }] };
    doc = removePlayer(doc, A);

    expect(doc.teams[0].players.some((p) => p.id === A)).toBe(false);
    for (const scene of doc.scenes) expect(scene.positions[A]).toBeUndefined();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("takes their run and travel override with them", () => {
    let doc = createBoardDoc();
    doc = { ...doc, scenes: [doc.scenes[0], { ...structuredClone(doc.scenes[0]), id: "s2", transitionMs: 1000 }] };
    doc = setPath(doc, 1, A, { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } });
    doc = setTravel(doc, 1, A, 2000);

    doc = removePlayer(doc, A);
    expect(doc.scenes[1].paths[A]).toBeUndefined();
    expect(doc.scenes[1].travel?.[A]).toBeUndefined();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("drops the ball where a carrier was standing", () => {
    let doc = setCarrier(createBoardDoc(), 0, A);
    const stood = doc.scenes[0].positions[A];

    doc = removePlayer(doc, A);
    expect(doc.scenes[0].carrier).toBeNull();
    // ballPos must exist exactly when there is no carrier, and the ball should
    // not teleport to the centre spot.
    expect(doc.scenes[0].ballPos).toEqual(stood);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("removes them from links, and drops a link left too small", () => {
    const doc = createBoardDoc();
    const back = doc.links.find((l) => l.name.includes("Back 4"))!;
    const mid = doc.links.find((l) => l.name.includes("Midfield 3"))!;

    let next = removePlayer(doc, back.members[0]);
    expect(next.links.find((l) => l.id === back.id)!.members).toHaveLength(3);

    next = removePlayer(next, mid.members[0]);
    next = removePlayer(next, mid.members[1]);
    expect(next.links.find((l) => l.id === mid.id)).toBeUndefined();
    expect(boardDocSchema.safeParse(next).success).toBe(true);
  });

  it("is a no-op for someone who is not there", () => {
    const doc = createBoardDoc();
    expect(removePlayer(doc, "ghost")).toBe(doc);
  });

  it("survives emptying a whole team", () => {
    let doc = createBoardDoc();
    for (const p of [...doc.teams[0].players]) doc = removePlayer(doc, p.id);
    expect(doc.teams[0].players).toHaveLength(0);
    expect(doc.teams[1].players).toHaveLength(11);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("shirt numbers must be free", () => {
  const home = (doc: BoardDoc) => doc.teams[0].players;

  it("refuses a number already worn in the same team", () => {
    const doc = createBoardDoc();
    const [first, second] = home(doc);
    const next = setPlayerNumber(doc, second.id, first.number);
    expect(next).toBe(doc);
    expect(home(next)[1].number).toBe(second.number);
  });

  it("allows the number the player already wears", () => {
    const doc = createBoardDoc();
    const p = home(doc)[3];
    expect(home(setPlayerNumber(doc, p.id, p.number))[3].number).toBe(p.number);
  });

  it("allows a number worn by the OTHER team", () => {
    // Both sides are built from formations, so 1-11 are taken on each. Park a
    // home player on 50 first, then give the same shirt to an away player.
    let doc = createBoardDoc();
    doc = setPlayerNumber(doc, home(doc)[5].id, 50);
    expect(home(doc)[5].number).toBe(50);

    doc = setPlayerNumber(doc, doc.teams[1].players[0].id, 50);
    expect(doc.teams[1].players[0].number).toBe(50);
    expect(doc.teams[0].players[5].number).toBe(50);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("allows a genuinely free number", () => {
    const doc = createBoardDoc();
    const worn = new Set(home(doc).map((p) => p.number));
    const free = [...Array(100).keys()].find((n) => !worn.has(n))!;
    expect(home(setPlayerNumber(doc, home(doc)[2].id, free))[2].number).toBe(free);
  });

  it("refuses after the clamp, not before it", () => {
    // 150 clamps to 99. If 99 is taken, the clamped value is what must be
    // refused — checking the raw input would let it through.
    let doc = createBoardDoc();
    doc = setPlayerNumber(doc, home(doc)[0].id, 99);
    const before = home(doc)[1].number;
    expect(setPlayerNumber(doc, home(doc)[1].id, 150).teams[0].players[1].number).toBe(before);
  });

  it("never leaves a team with two players on one shirt", () => {
    let doc = createBoardDoc();
    for (const p of home(doc)) doc = setPlayerNumber(doc, p.id, 7);
    const numbers = doc.teams[0].players.map((p) => p.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps the document valid", () => {
    const doc = setPlayerNumber(createBoardDoc(), createBoardDoc().teams[0].players[0].id, 42);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("shirtClash", () => {
  it("names the player standing in the way", () => {
    const doc = createBoardDoc();
    const [first, second] = doc.teams[0].players;
    expect(shirtClash(doc, second.id, first.number)?.id).toBe(first.id);
  });

  it("is null for the player's own number, and for a free one", () => {
    const doc = createBoardDoc();
    const p = doc.teams[0].players[0];
    expect(shirtClash(doc, p.id, p.number)).toBeNull();
    const worn = new Set(doc.teams[0].players.map((x) => x.number));
    const free = [...Array(100).keys()].find((n) => !worn.has(n))!;
    expect(shirtClash(doc, p.id, free)).toBeNull();
  });
});

describe("removePlayer and the highlight", () => {
  it("takes the departing player's halo with them", () => {
    const doc = setHighlight(createBoardDoc(), 0, ["home-2", "home-5"], "#f59e0b");
    const after = removePlayer(doc, "home-2");
    expect(after.scenes[0].highlight).toEqual({ "home-5": "#f59e0b" });
    expect(boardDocSchema.safeParse(after).success).toBe(true);
  });

  // Absent rather than empty, so a scene with nothing lit serialises exactly as it
  // did before the field existed.
  it("drops the key when they were the only one lit", () => {
    const doc = setHighlight(createBoardDoc(), 0, ["home-2"], "#f59e0b");
    expect(removePlayer(doc, "home-2").scenes[0].highlight).toBeUndefined();
  });
});
