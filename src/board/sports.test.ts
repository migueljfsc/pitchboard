import { describe, expect, it } from "vitest";
import { SPORTS, goalAt, sportOf, toMetres } from "./sports";
import { clampBall, moveEntities, playBall } from "./interaction";
import { addSceneAfter, setCarrier } from "./scenes";
import { boardDocSchema } from "./schema";
import { linkGeometry } from "./links";
import { resolveAt, sceneTimings } from "./timeline";
import { createBoardDoc, isUntouched, sidesFor } from "@/formations";
import { fromJson, toSetupJson } from "@/share/json";
import { presetsFor, type SquadPreset } from "@/share/presets";
import type { BoardDoc } from "./types";

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
    const out = fromJson(toSetupJson(basketball()));
    expect(out.ok && out.doc.sport).toBe("basketball");
  });

  it("shows each sport only its own squads", () => {
    const squad = (id: string, sport?: SquadPreset["sport"]): SquadPreset => ({ id, label: id, ...(sport ? { sport } : {}) });
    const list = [squad("a"), squad("b", "basketball"), squad("c", "football")];
    expect(presetsFor(list, "football").map((p) => p.id)).toEqual(["a", "c"]);
    expect(presetsFor(list, "basketball").map((p) => p.id)).toEqual(["b"]);
  });
});
