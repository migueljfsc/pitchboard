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
  createBoardDoc,
  fromNotation,
  getFormation,
} from ".";
import { boardDocSchema } from "@/board/schema";
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

  it("gives a back four an open chain and a midfield three a polygon", () => {
    const { links } = buildTeam({ ...HOME, formation: "4-3-3" }, PITCH);
    const back = links.find((l) => l.name.includes("Back 4"));
    const mid = links.find((l) => l.name.includes("Midfield 3"));
    expect(back?.style).toBe("chain");
    expect(back?.members).toHaveLength(4);
    expect(mid?.style).toBe("polygon");
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
