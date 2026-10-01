import { describe, expect, it } from "vitest";
import { FUTSAL_COURT, ICE_RINK, SPORTS, goalAt, goalLineX, sportOf, toMetres } from "./sports";
import { clampBall, moveEntities, playBall } from "./interaction";
import { addSceneAfter, setCarrier } from "./scenes";
import { boardDocSchema } from "./schema";
import { linkGeometry } from "./links";
import { resolveAt, sceneTimings } from "./timeline";
import { createBoardDoc, formationsFor, isUntouched, sidesFor } from "@/formations";
import { fromJson, toSetupJson } from "@/share/json";
import { boardFromTracks } from "@/import";
import { presetsFor, type SquadPreset } from "@/share/presets";
import type { BoardDoc } from "./types";
import { SPORT_IDS } from "./types";

const basketball = (): BoardDoc => {
  const [home, away] = sidesFor("basketball");
  return createBoardDoc(home, away, undefined, {}, "basketball");
};

describe("courts in board units (D113)", () => {
  it("leaves football exactly as it was: metres, on 105 x 68", () => {
    expect(SPORTS.football.pitch).toEqual({ length: 105, width: 68 });
    expect(SPORTS.football.metresPerUnit).toBe(1);
    expect(sportOf({}).id).toBe("football");
  });

  it("lays a 28 x 15 m basketball court out at football's length", () => {
    const { pitch, metresPerUnit } = SPORTS.basketball;
    expect(pitch.length).toBe(105);
    expect(pitch.width * metresPerUnit).toBeCloseTo(15, 9);
    expect(pitch.length * metresPerUnit).toBeCloseTo(28, 9);
  });

  it("reads a distance back in metres", () => {
    expect(toMetres({}, 10)).toBe(10);
    expect(toMetres({ sport: "basketball" }, 105)).toBeCloseTo(28, 9);
  });
});

describe("a new board of a sport", () => {
  it("is a valid board, five a side with no keeper's kit", () => {
    const doc = basketball();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.sport).toBe("basketball");
    expect(doc.teams.map((t) => t.players.length)).toEqual([5, 5]);
    expect(doc.teams.map((t) => t.formation)).toEqual(["2-3", "1-3-1"]);
  });

  it("says nothing about its sport when it is football", () => {
    expect("sport" in createBoardDoc()).toBe(false);
  });

  it("is untouched until something changes, whatever the seeded names", () => {
    const doc = basketball();
    expect(isUntouched(doc)).toBe(true);
    expect(isUntouched({ ...doc, name: "Quadro", teams: [{ ...doc.teams[0], name: "Casa" }, doc.teams[1]] })).toBe(
      true,
    );
    const id = doc.teams[0].players[0].id;
    expect(isUntouched(moveEntities(doc, 0, [id], { x: 3, y: 0 }))).toBe(false);
    expect(isUntouched(addSceneAfter(doc, 0))).toBe(false);
  });
});

describe("goals", () => {
  it("scores a football behind either goal line", () => {
    const doc = createBoardDoc();
    expect(goalAt(doc, { x: -1, y: 34 })).toEqual({ x: -1, y: 34 });
    expect(goalAt(doc, { x: 50, y: 34 })).toBeNull();
  });

  it("scores a basketball dropped within reach of a ring, through its middle", () => {
    const doc = basketball();
    const hoop = SPORTS.basketball.goal;
    if (hoop.kind !== "hoop") throw new Error("basketball has rings");
    const ring = { x: doc.pitch.length - hoop.centre, y: doc.pitch.width / 2 };
    expect(goalAt(doc, { x: ring.x + hoop.reach * 0.8, y: ring.y })).toEqual(ring);
    expect(goalAt(doc, { x: ring.x + hoop.reach * 1.2, y: ring.y })).toBeNull();
  });

  it("keeps a basketball on the court: its goals are inside it", () => {
    expect(clampBall({ x: -1, y: 20 }, SPORTS.basketball.pitch, SPORTS.basketball.goal)).toEqual({ x: 0, y: 20 });
  });

  it("marks a ball played into the ring a shot", () => {
    let doc = addSceneAfter(basketball(), 0);
    doc = setCarrier(doc, 0, "home-1", "stationary");
    const hoop = SPORTS.basketball.goal;
    if (hoop.kind !== "hoop") throw new Error("basketball has rings");
    const ring = { x: doc.pitch.length - hoop.centre, y: doc.pitch.width / 2 };
    const next = playBall(doc, 1, { x: ring.x + 0.5, y: ring.y }, null, "stationary");
    expect(next.scenes[1].ballPos).toEqual(ring);
    expect(next.scenes[1].shot).toBe(true);
  });
});

describe("what a person reads is metres", () => {
  it("paces a flow in metres a second, not units", () => {
    let doc = addSceneAfter(basketball(), 0);
    const id = doc.teams[0].players[0].id;
    const from = doc.scenes[1].positions[id];
    doc = moveEntities(doc, 1, [id], { x: 90 - from.x, y: 0 });
    doc = { ...doc, flow: { speed: 6, endHoldMs: 0 } };
    const units = 90 - from.x;
    expect(sceneTimings(doc)[1].travelMs).toBeCloseTo((toMetres(doc, units) / 6) * 1000, 6);
  });

  it("measures a link's edges in metres", () => {
    const doc = basketball();
    const link = doc.links[0];
    const g = linkGeometry(link, resolveAt(doc, 0), doc)!;
    const [a, b] = [g.points[0], g.points[1]];
    expect(g.edges[0].metres).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y) * SPORTS.basketball.metresPerUnit, 9);
  });
});

describe("what travels with a sport", () => {
  it("keeps a setup file's sport", () => {
    const out = fromJson(toSetupJson(basketball()), boardFromTracks);
    expect(out.ok && out.doc.sport).toBe("basketball");
  });

  it("shows each sport only its own squads", () => {
    const squad = (id: string, sport?: SquadPreset["sport"]): SquadPreset => ({ id, label: id, ...(sport ? { sport } : {}) });
    const list = [squad("a"), squad("b", "basketball"), squad("c", "football")];
    expect(presetsFor(list, "football").map((p) => p.id)).toEqual(["a", "c"]);
    expect(presetsFor(list, "basketball").map((p) => p.id)).toEqual(["b"]);
  });
});

describe("handball and field hockey", () => {
  const board = (sport: "handball" | "hockey"): BoardDoc => {
    const [home, away] = sidesFor(sport);
    return createBoardDoc(home, away, undefined, {}, sport);
  };

  it("lays every court out at football's length, true to its metres", () => {
    expect(SPORTS.handball.pitch.length).toBe(105);
    expect(SPORTS.handball.pitch.width * SPORTS.handball.metresPerUnit).toBeCloseTo(20, 9);
    expect(SPORTS.hockey.pitch.length * SPORTS.hockey.metresPerUnit).toBeCloseTo(91.4, 9);
    expect(SPORTS.hockey.pitch.width * SPORTS.hockey.metresPerUnit).toBeCloseTo(55, 9);
  });

  it("starts seven a side in handball and eleven in hockey, each with a keeper", () => {
    const hb = board("handball");
    const fh = board("hockey");
    expect(boardDocSchema.safeParse(hb).success).toBe(true);
    expect(boardDocSchema.safeParse(fh).success).toBe(true);
    expect(hb.teams.map((t) => t.players.length)).toEqual([7, 7]);
    expect(fh.teams.map((t) => t.players.length)).toEqual([11, 11]);
    expect(SPORTS.handball.keeper && SPORTS.hockey.keeper).toBe(true);
  });

  it("bends a handball six round its goal: the wings nearer the line than the middle", () => {
    const doc = board("handball");
    const at = (n: number) => doc.scenes[0].positions[`home-${n}`];
    expect(at(2).x).toBeLessThan(at(4).x);
    expect(at(7).x).toBeCloseTo(at(2).x, 9);
    expect(toMetres(doc, at(4).x)).toBeCloseTo(6.8, 6);
  });

  it("scores a ball dropped in the net, and keeps it between the posts", () => {
    const doc = board("handball");
    const goal = SPORTS.handball.goal;
    if (goal.kind !== "net") throw new Error("handball has nets");
    const clamped = clampBall({ x: doc.pitch.length + 1, y: 0 }, doc.pitch, goal);
    expect(Math.abs(clamped.y - doc.pitch.width / 2)).toBeCloseTo(goal.width / 2, 9);
    expect(goalAt(doc, clamped)).toEqual(clamped);
  });
});

describe("futsal", () => {
  const board = (): BoardDoc => {
    const [home, away] = sidesFor("futsal");
    return createBoardDoc(home, away, undefined, {}, "futsal");
  };

  it("comes second, after football and before basketball — the menu's and the library's order", () => {
    expect(SPORT_IDS.slice(0, 3)).toEqual(["football", "futsal", "basketball"]);
  });

  it("lays a 40 x 20 m court out at football's length", () => {
    expect(SPORTS.futsal.pitch.length).toBe(105);
    expect(SPORTS.futsal.pitch.length * SPORTS.futsal.metresPerUnit).toBeCloseTo(40, 9);
    expect(SPORTS.futsal.pitch.width * SPORTS.futsal.metresPerUnit).toBeCloseTo(20, 9);
  });

  it("joins its penalty arcs with 3.16 m, the goal and both posts, as Law 1 has it", () => {
    expect(FUTSAL_COURT.goalWidth + FUTSAL_COURT.postWidth * 2).toBeCloseTo(3.16, 9);
  });

  it("starts five a side, each with a keeper, in a diamond against a square", () => {
    const doc = board();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.teams.map((t) => t.players.length)).toEqual([5, 5]);
    expect(doc.teams.map((t) => t.formation)).toEqual(["1-2-1", "2-2"]);
    expect(SPORTS.futsal.keeper).toBe(true);
  });

  it("offers only five-a-side shapes, keeper first", () => {
    for (const f of formationsFor("futsal")) {
      expect(f.lines.flatMap((l) => l.numbers)).toHaveLength(5);
      expect(f.lines[0].role).toBe("keeper");
    }
  });

  it("keeps every side in its own half", () => {
    const doc = board();
    for (const [i, team] of doc.teams.entries()) {
      for (const p of team.players) {
        const x = toMetres(doc, doc.scenes[0].positions[p.id].x);
        expect(i === 0 ? x < 20 : x > 20).toBe(true);
      }
    }
  });

  it("scores a ball dropped in the net", () => {
    const doc = board();
    const goal = SPORTS.futsal.goal;
    if (goal.kind !== "net") throw new Error("futsal has nets");
    const clamped = clampBall({ x: doc.pitch.length + 1, y: doc.pitch.width / 2 }, doc.pitch, goal);
    expect(goalAt(doc, clamped)).toEqual(clamped);
  });
});

describe("volleyball", () => {
  const board = (): BoardDoc => {
    const [home, away] = sidesFor("volleyball");
    return createBoardDoc(home, away, undefined, {}, "volleyball");
  };

  it("is the court and its free zone: 18 x 9 m of lines inside 24 x 15 m of board", () => {
    const spec = SPORTS.volleyball;
    expect(spec.pitch.length * spec.metresPerUnit).toBeCloseTo(24, 9);
    expect(spec.pitch.width * spec.metresPerUnit).toBeCloseTo(15, 9);
    expect(spec.court!.length * spec.metresPerUnit).toBeCloseTo(18, 9);
    expect(spec.court!.x * spec.metresPerUnit).toBeCloseTo(3, 9);
  });

  it("starts six a side, each in its own half of the net, with no keeper", () => {
    const doc = board();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.teams.map((t) => t.players.length)).toEqual([6, 6]);
    expect(SPORTS.volleyball.keeper).toBe(false);
    const mid = doc.pitch.length / 2;
    const [home, away] = doc.teams.map((t) => t.players.map((p) => doc.scenes[0].positions[p.id].x));
    expect(Math.max(...home)).toBeLessThan(mid);
    expect(Math.min(...away)).toBeGreaterThan(mid);
  });

  it("lets a server stand behind the end line, in the free zone", () => {
    const doc = board();
    const id = "home-1";
    const next = moveEntities(doc, 0, [id], { x: -200, y: 0 });
    expect(next.scenes[0].positions[id].x).toBe(0);
    expect(next.scenes[0].positions[id].x).toBeLessThan(SPORTS.volleyball.court!.x);
  });

  it("has no goal: nothing a dropped ball lands on scores", () => {
    const doc = board();
    expect(goalAt(doc, { x: -1, y: doc.pitch.width / 2 })).toBeNull();
    expect(goalAt(doc, { x: doc.pitch.length / 2, y: doc.pitch.width / 2 })).toBeNull();
  });
});

describe("ice hockey's goals stand on the ice (D123)", () => {
  const spec = SPORTS.icehockey;
  const doc = { sport: "icehockey" as const, pitch: spec.pitch };
  const goal = spec.goal.kind === "net" ? spec.goal : null;
  const m = (metres: number) => metres / spec.metresPerUnit;
  const cy = spec.pitch.width / 2;

  it("is the IIHF championship rink, goal lines four metres in", () => {
    expect(toMetres(doc, spec.pitch.length)).toBeCloseTo(ICE_RINK.length, 6);
    expect(toMetres(doc, spec.pitch.width)).toBeCloseTo(ICE_RINK.width, 6);
    expect(goalLineX(goal!, spec.pitch.length, 1)).toBeCloseTo(m(4), 6);
    expect(goalLineX(goal!, spec.pitch.length, -1)).toBeCloseTo(m(56), 6);
  });

  it("scores a puck in the net, at either end", () => {
    expect(goalAt(doc, { x: m(3.6), y: cy })).not.toBeNull();
    expect(goalAt(doc, { x: m(56.5), y: cy + m(0.5) })).not.toBeNull();
  });

  // Play goes on behind the net: the goal line alone is not a goal.
  it("does not score behind the net, beside it, or short of the line", () => {
    expect(goalAt(doc, { x: m(1.5), y: cy })).toBeNull();
    expect(goalAt(doc, { x: m(3.6), y: cy + m(2) })).toBeNull();
    expect(goalAt(doc, { x: m(4.5), y: cy })).toBeNull();
    expect(goalAt(doc, { x: m(58.5), y: cy })).toBeNull();
  });

  it("lets the puck go anywhere on the ice, behind the nets included", () => {
    const behind = { x: m(1), y: cy };
    expect(clampBall(behind, spec.pitch, spec.goal)).toEqual(behind);
    expect(clampBall({ x: -5, y: cy }, spec.pitch, spec.goal).x).toBe(0);
  });

  it("leaves football's goals on the end of the board", () => {
    const football = SPORTS.football.goal;
    expect(football.kind === "net" && football.line).toBeFalsy();
    expect(goalAt({ pitch: SPORTS.football.pitch }, { x: -1, y: 34 })).not.toBeNull();
  });
});
