import { describe, expect, it } from "vitest";
import {
  AWAY,
  DEPTH_MAX,
  DEPTH_MIN,
  FORMATIONS,
  FORMATION_GROUPS,
  HOME,
  applyFormation,
  buildTeam,
  changeFormation,
  createBoardDoc,
  fromNotation,
  getFormation,
  resetPositions,
} from ".";
import { boardDocSchema } from "@/board/schema";
import { setPlayerLabel, setPlayerNumber } from "@/board/players";
import type { BoardDoc } from "@/board/types";
import { TOKEN_RADIUS } from "@/board/render";

const PITCH = { length: 105, width: 68 };

describe("presets", () => {
  it("every preset fields eleven players", () => {
    for (const f of FORMATIONS) {
      const total = f.lines.reduce((n, l) => n + l.spread.length, 0);
      expect(total, f.id).toBe(11);
    }
  });

  it("every preset gives each line as many numbers as positions", () => {
    for (const f of FORMATIONS) {
      for (const line of f.lines) {
        expect(line.numbers.length, `${f.id} ${line.label}`).toBe(line.spread.length);
      }
    }
  });

  it("every preset uses distinct shirt numbers", () => {
    for (const f of FORMATIONS) {
      const nums = f.lines.flatMap((l) => l.numbers);
      expect(new Set(nums).size, f.id).toBe(nums.length);
    }
  });

  it("matches its own notation", () => {
    for (const f of FORMATIONS) {
      const expected = f.id.split("-").map(Number).filter((n) => n > 0);
      const outfield = f.lines.slice(1).map((l) => l.spread.length);
      expect(outfield, f.id).toEqual(expected);
    }
  });

  it("fields exactly eleven including the keeper", () => {
    for (const f of FORMATIONS) {
      const total = f.lines.reduce((n, l) => n + l.spread.length, 0);
      expect(total, f.id).toBe(11);
    }
  });

  it("uses only shirt numbers 1-11 — no squad numbers in a starting eleven", () => {
    for (const f of FORMATIONS) {
      for (const n of f.lines.flatMap((l) => l.numbers)) {
        expect(n, f.id).toBeLessThanOrEqual(11);
        expect(n, f.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("gives the keeper 1 and the lone striker 9", () => {
    for (const f of FORMATIONS) {
      expect(f.lines[0].numbers, f.id).toEqual([1]);
      const front = f.lines[f.lines.length - 1];
      if (front.spread.length === 1) expect(front.numbers, f.id).toEqual([9]);
    }
  });

  it("groups every preset under a declared heading", () => {
    for (const f of FORMATIONS) expect(FORMATION_GROUPS, f.id).toContain(f.group);
    for (const g of FORMATION_GROUPS) {
      expect(FORMATIONS.some((f) => f.group === g), g).toBe(true);
    }
  });

  it("spreads every line symmetrically about the centre", () => {
    for (const f of FORMATIONS) {
      for (const line of f.lines) {
        const sum = line.spread[0] + line.spread[line.spread.length - 1];
        expect(sum, `${f.id} ${line.label}`).toBeCloseTo(1);
      }
    }
  });

  it("keeps every line in its own half", () => {
    // A preset that pushes past the halfway line collides with the opposing
    // default formation — see the no-overlap test below.
    for (const f of FORMATIONS) {
      for (const line of f.lines) {
        expect(line.depth, `${f.id} ${line.label}`).toBeLessThanOrEqual(DEPTH_MAX);
      }
      expect(DEPTH_MAX, "a line past the halfway mark collides with the opposition").toBeLessThan(0.5);
    }
  });

  it("widens an interior three only when no front three carries the width", () => {
    // 4-3-3's middle three are central midfielders; 4-2-3-1's are wingers.
    const central = getFormation("4-3-3").lines.find((l) => l.label === "Midfield 3")!;
    const wingers = getFormation("4-2-3-1").lines.find((l) => l.label === "Attacking 3")!;
    const width = (l: { spread: number[] }) => l.spread[l.spread.length - 1] - l.spread[0];
    expect(width(wingers)).toBeGreaterThan(width(central));
  });

  it("puts a back three narrower than a back four", () => {
    const width = (id: string) => {
      const l = getFormation(id).lines[1];
      return l.spread[l.spread.length - 1] - l.spread[0];
    };
    expect(width("3-5-2")).toBeLessThan(width("4-4-2"));
  });

  it("falls back rather than throwing on an unknown id", () => {
    expect(getFormation("nonsense").id).toBeDefined();
  });
});

describe("fromNotation", () => {
  it("drops zero lines, so small-sided notations like 2-0-2 still parse", () => {
    const f = fromNotation("2-0-2", "Test");
    expect(f.lines.slice(1).map((l) => l.spread.length)).toEqual([2, 2]);
  });

  it("centres a single outfield line between the depth bounds", () => {
    const f = fromNotation("4", "Test");
    expect(f.lines[1].depth).toBeCloseTo((DEPTH_MIN + DEPTH_MAX) / 2);
  });
});

describe("buildTeam", () => {
  it("places every player on the pitch", () => {
    const { team, positions } = buildTeam(HOME, PITCH);
    expect(team.players).toHaveLength(11);
    for (const p of team.players) {
      const at = positions[p.id];
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(PITCH.length);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeLessThanOrEqual(PITCH.width);
    }
  });

  it("mirrors by direction so the two sides face each other", () => {
    const left = buildTeam({ ...HOME, direction: "left" }, PITCH);
    const right = buildTeam({ ...HOME, id: "x", direction: "right" }, PITCH);

    const lk = left.positions[`${HOME.id}-1`];
    const rk = right.positions["x-1"];
    expect(lk.x).toBeLessThan(PITCH.length / 2);
    expect(rk.x).toBeGreaterThan(PITCH.length / 2);
    expect(lk.x + rk.x).toBeCloseTo(PITCH.length);
  });

  it("seeds links only for lines with two or more players", () => {
    const { links } = buildTeam({ ...HOME, formation: "4-2-3-1" }, PITCH);
    // Back 4, double pivot, front 3 — the lone striker and keeper get none.
    expect(links).toHaveLength(3);
    for (const l of links) expect(l.members.length).toBeGreaterThanOrEqual(2);
  });

  it("seeds every line as an open chain", () => {
    const { links } = buildTeam({ ...HOME, formation: "4-3-3" }, PITCH);
    const back = links.find((l) => l.name.includes("Back 4"));
    const mid = links.find((l) => l.name.includes("Midfield 3"));
    expect(back?.style).toBe("chain");
    expect(back?.members).toHaveLength(4);
    expect(mid?.style).toBe("chain");
    expect(mid?.members).toHaveLength(3);
  });
});

describe("no overlapping tokens", () => {
  // Regression: the original depths put a 4-3-3 front line and a 4-4-2 midfield
  // both at x=61 m, so red 7 rendered underneath blue 11 on the default board.
  const MIN_GAP = TOKEN_RADIUS * 2;

  it("holds for every home/away preset combination", () => {
    for (const home of FORMATIONS) {
      for (const away of FORMATIONS) {
        const doc = createBoardDoc(
          { ...HOME, formation: home.id },
          { ...AWAY, formation: away.id },
        );
        const spots = Object.entries(doc.scenes[0].positions);

        for (let i = 0; i < spots.length; i++) {
          for (let j = i + 1; j < spots.length; j++) {
            const gap = Math.hypot(
              spots[i][1].x - spots[j][1].x,
              spots[i][1].y - spots[j][1].y,
            );
            expect(
              gap,
              `${home.id} vs ${away.id}: ${spots[i][0]} and ${spots[j][0]} overlap`,
            ).toBeGreaterThan(MIN_GAP);
          }
        }
      }
    }
  });
});

describe("createBoardDoc", () => {
  it("produces a valid document", () => {
    expect(boardDocSchema.safeParse(createBoardDoc()).success).toBe(true);
  });

  it("has one scene, a loose ball and no paths", () => {
    const doc = createBoardDoc();
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0].carrier).toBeNull();
    expect(doc.scenes[0].ballPos).toEqual({ x: 52.5, y: 34 });
    expect(doc.scenes[0].paths).toEqual({});
  });
});

describe("applyFormation", () => {
  it("stays valid across every preset, for either team", () => {
    for (const f of FORMATIONS) {
      for (const idx of [0, 1] as const) {
        const base = idx === 0 ? HOME : AWAY;
        const next = applyFormation(createBoardDoc(), idx, { ...base, formation: f.id });
        const result = boardDocSchema.safeParse(next);
        expect(result.success, `${f.id} team ${idx}`).toBe(true);
      }
    }
  });

  it("leaves the other team untouched", () => {
    const doc = createBoardDoc();
    const next = applyFormation(doc, 0, { ...HOME, formation: "3-5-2" });
    for (const p of doc.teams[1].players) {
      expect(next.scenes[0].positions[p.id]).toEqual(doc.scenes[0].positions[p.id]);
    }
    expect(next.teams[1]).toEqual(doc.teams[1]);
  });

  it("drops links belonging to the replaced team only", () => {
    const doc = createBoardDoc();
    const next = applyFormation(doc, 0, { ...HOME, formation: "3-5-2" });
    const awayIds = new Set(doc.teams[1].players.map((p) => p.id));
    const survivingAway = doc.links.filter((l) => l.members.every((m) => awayIds.has(m)));
    for (const l of survivingAway) {
      expect(next.links.some((n) => n.id === l.id)).toBe(true);
    }
    // No link may reference a player that no longer exists.
    const ids = new Set(next.teams.flatMap((t) => t.players.map((p) => p.id)));
    for (const l of next.links) for (const m of l.members) expect(ids.has(m)).toBe(true);
  });
});

describe("team.formation", () => {
  it("is recorded on the built team, so a board knows its own shape", () => {
    expect(createBoardDoc().teams[0].formation).toBe(HOME.formation);
    expect(createBoardDoc().teams[1].formation).toBe(AWAY.formation);
  });

  it("records the RESOLVED preset, never one getFormation would fall back from", () => {
    const built = buildTeam({ ...HOME, formation: "not-a-formation" }, PITCH);
    expect(built.team.formation).toBe(getFormation("not-a-formation").id);
  });

  it("follows a formation change", () => {
    const doc = applyFormation(createBoardDoc(), 0, { ...HOME, formation: "3-5-2" });
    expect(doc.teams[0].formation).toBe("3-5-2");
    expect(doc.teams[1].formation).toBe(AWAY.formation);
  });
});

describe("squad overrides", () => {
  it("numbers and names the eleven in formation order, keeper first", () => {
    const built = buildTeam(
      { ...HOME, squad: [{ number: 31, label: "Ederson" }, { label: "Walker" }] },
      PITCH,
    );
    expect(built.team.players[0]).toEqual({ id: "home-31", number: 31, label: "Ederson" });
    expect(built.team.players[1].label).toBe("Walker");
    // A slot left out keeps the number the preset would have given it.
    expect(built.team.players[1].number).toBe(
      buildTeam(HOME, PITCH).team.players[1].number,
    );
  });

  it("leaves slots past the end of the list alone", () => {
    const plain = buildTeam(HOME, PITCH);
    const built = buildTeam({ ...HOME, squad: [{ number: 31 }] }, PITCH);
    expect(built.team.players.slice(1)).toEqual(plain.team.players.slice(1));
  });

  it("seeds links against the overridden numbers", () => {
    const built = buildTeam({ ...HOME, squad: [{}, { number: 77 }] }, PITCH);
    expect(built.links[0].members[0]).toBe("home-77");
  });
});

describe("resetPositions", () => {
  const moved = () => {
    const doc = createBoardDoc();
    const id = doc.teams[0].players[5].id;
    return {
      id,
      doc: {
        ...doc,
        scenes: doc.scenes.map((s) => ({
          ...s,
          positions: { ...s.positions, [id]: { x: 90, y: 5 } },
          paths: { [id]: { c1: { x: 40, y: 40 }, c2: { x: 60, y: 20 } } },
        })),
      },
    };
  };

  it("puts a moved player back on their formation mark", () => {
    const { id, doc } = moved();
    const back = resetPositions(doc);
    expect(back.scenes[0].positions[id]).toEqual(createBoardDoc().scenes[0].positions[id]);
  });

  it("keeps names, numbers, links, the ball and the scene list", () => {
    const { doc } = moved();
    const named = {
      ...doc,
      teams: [
        { ...doc.teams[0], players: doc.teams[0].players.map((p) => ({ ...p, label: "Kept" })) },
        doc.teams[1],
      ] as typeof doc.teams,
    };
    const back = resetPositions(named);
    expect(back.teams[0].players.every((p) => p.label === "Kept")).toBe(true);
    expect(back.links).toEqual(named.links);
    expect(back.scenes).toHaveLength(named.scenes.length);
    expect(back.scenes[0].ballPos).toEqual(named.scenes[0].ballPos);
  });

  it("clears the runs it flattens — every scene now holds the same shape", () => {
    const { doc } = moved();
    expect(resetPositions(doc).scenes[0].paths).toEqual({});
  });

  it("pairs slots by ORDER, so a renumbered player still goes home", () => {
    const { id, doc } = moved();
    const renumbered = {
      ...doc,
      teams: [
        {
          ...doc.teams[0],
          players: doc.teams[0].players.map((p) => (p.id === id ? { ...p, number: 88 } : p)),
        },
        doc.teams[1],
      ] as typeof doc.teams,
    };
    // The id still says `home-<old number>`; only the slot's position matters.
    expect(resetPositions(renumbered).scenes[0].positions[id]).toEqual(
      createBoardDoc().scenes[0].positions[id],
    );
  });

  it("leaves a hand-added player, who has no formation mark, where they are", () => {
    const doc = createBoardDoc();
    const extra = { id: "home-99", number: 99, label: "Sub" };
    const grown = {
      ...doc,
      teams: [
        { ...doc.teams[0], players: [...doc.teams[0].players, extra] },
        doc.teams[1],
      ] as typeof doc.teams,
      scenes: doc.scenes.map((s) => ({
        ...s,
        positions: { ...s.positions, [extra.id]: { x: 3, y: 3 } },
      })),
    };
    expect(resetPositions(grown).scenes[0].positions[extra.id]).toEqual({ x: 3, y: 3 });
  });

  it("leaves a valid document", () => {
    const { doc } = moved();
    expect(boardDocSchema.safeParse(resetPositions(doc)).success).toBe(true);
  });
});

describe("changing formation", () => {
  /** Rename and renumber a side, the way a coach would before switching shape. */
  function named() {
    let doc = createBoardDoc();
    doc.teams[0].players.forEach((p, i) => {
      doc = setPlayerLabel(doc, p.id, `Name ${i + 1}`);
    });
    return doc;
  }

  const change = (doc: BoardDoc, formation: string) => changeFormation(doc, 0, formation);

  it("keeps the squad's names", () => {
    const doc = named();
    const before = doc.teams[0].players.map((p) => p.label);
    const after = change(doc, "3-5-2").teams[0].players.map((p) => p.label);
    expect(after).toEqual(before);
  });

  it("keeps the squad's numbers", () => {
    let doc = named();
    doc = setPlayerNumber(doc, doc.teams[0].players[5].id, 77);
    const before = doc.teams[0].players.map((p) => p.number);
    const after = change(doc, "4-2-3-1").teams[0].players.map((p) => p.number);
    expect(after).toEqual(before);
  });

  it("moves them, though — the shape is the point", () => {
    const doc = named();
    const before = { ...doc.scenes[0].positions };
    const after = change(doc, "3-5-2").scenes[0].positions;
    const moved = doc.teams[0].players.filter(
      (p) => after[p.id] && before[p.id].x !== after[p.id].x,
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it("replaces the old shape's links rather than stacking them", () => {
    const doc = named();
    const ours = (d: BoardDoc) => {
      const ids = new Set(d.teams[0].players.map((p) => p.id));
      return d.links.filter((l) => l.members.some((m) => ids.has(m)));
    };
    const before = ours(doc).length;
    const after = change(doc, "3-5-2");
    expect(before).toBeGreaterThan(0);
    expect(ours(after).length).toBeLessThanOrEqual(before + 1);
    // Nothing from the old shape may survive under its old name.
    for (const link of ours(after)) expect(link.name).not.toMatch(/Back 4/);
  });

  it("leaves the opponent's links alone", () => {
    const doc = named();
    const awayIds = new Set(doc.teams[1].players.map((p) => p.id));
    const theirs = (d: BoardDoc) => d.links.filter((l) => l.members.every((m) => awayIds.has(m)));
    expect(theirs(change(doc, "3-5-2"))).toEqual(theirs(doc));
  });

  it("does not accumulate links across repeated changes", () => {
    let doc = named();
    for (const f of ["3-5-2", "4-4-2", "4-3-3", "5-3-2", "4-3-3"]) doc = change(doc, f);
    const counts = new Map<string, number>();
    for (const l of doc.links) counts.set(l.id, (counts.get(l.id) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(doc.links.length).toBeLessThan(10);
  });

  it("never mints two players on one shirt, even from a short squad", () => {
    // A squad shallower than the new shape leaves slots to the formation's own
    // numbers, which can land on one the squad already uses. Ids come from the
    // number, so a clash would silently drop a player.
    for (const formation of FORMATIONS.map((f) => f.id)) {
      const squad = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => ({ number }));
      const doc = applyFormation(createBoardDoc(), 0, { ...HOME, formation, squad });
      const numbers = doc.teams[0].players.map((p) => p.number);
      const ids = doc.teams[0].players.map((p) => p.id);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(new Set(ids).size).toBe(ids.length);
      expect(boardDocSchema.safeParse(doc).success).toBe(true);
    }
  });

  it("still produces a valid board", () => {
    const doc = change(named(), "3-4-3");
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  /**
   * buildTeam mints the whole team object, so anything not carried on the spec is
   * silently dropped — the same trap that loses a squad or a set of links.
   */
  it("keeps the kit pattern across a formation change", () => {
    const base = named();
    const teams = base.teams.slice() as BoardDoc["teams"];
    teams[0] = { ...teams[0], pattern: "vertical" };

    const doc = change({ ...base, teams }, "3-4-3");
    expect(doc.teams[0].pattern).toBe("vertical");
    expect(doc.teams[1].pattern).toBeUndefined();
  });
});
