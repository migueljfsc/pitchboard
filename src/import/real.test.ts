/**
 * A real clip, end to end.
 *
 * The fixture is the output of football-tracks on a sport.tv recording of a Rio Ave
 * goal — screen-captured, a night match, no annotations, seeded by one human click.
 * It is here because every synthetic test in this folder agrees with whatever the
 * reduction happens to do, and real tracks do not: this one caught spectators arriving
 * as an eleven, and a board where every player was on the same team.
 */

import { describe, expect, it } from "vitest";
import { boardDocSchema } from "@/board/schema";
import { fidelity } from "./fidelity";
import { boardFromTracks } from "./index";
import fixture from "./__fixtures__/rioave.json";

describe("a real broadcast goal", () => {
  const result = boardFromTracks(fixture, { labels: { board: "Rio Ave 0-1 Sporting" } });

  it("imports", () => {
    expect(result.ok).toBe(true);
  });

  it("produces a document the Worker would accept", () => {
    // The Worker validates with this schema, so anything it rejects is a board that can
    // be built locally and never shared.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(boardDocSchema.safeParse(result.doc).success).toBe(true);
  });

  it("puts every player on the pitch", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const scene of result.doc.scenes) {
      for (const p of Object.values(scene.positions)) {
        expect(p.x).toBeGreaterThan(-5);
        expect(p.x).toBeLessThan(110);
        expect(p.y).toBeGreaterThan(-5);
        expect(p.y).toBeLessThan(73);
      }
    }
  });

  it("finds both sides", () => {
    // Spectators behind the goal sit at negative x, which is how the side playing left
    // is decided — so until they were filtered they took the "home" label outright and
    // every real player landed on one team.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.teams[0].players.length).toBeGreaterThan(0);
    expect(result.doc.teams[1].players.length).toBeGreaterThan(0);
  });

  it("chooses scenes from the play rather than filling the cap", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes.length).toBeGreaterThan(2);
    expect(result.doc.scenes.length).toBeLessThan(12);
  });

  it("fields a roster worth calling a board", () => {
    // Trimming to the best-observed passage is what buys this. Over the whole clip the
    // same file gives 6 v 3, with half of those players' positions held rather than seen.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total = result.doc.teams[0].players.length + result.doc.teams[1].players.length;
    expect(total).toBeGreaterThanOrEqual(12);
    // And not more than a pitch holds: past that the roster is fragments of the same
    // player arriving as two.
    expect(total).toBeLessThanOrEqual(22);
  });
});

describe("run fidelity on a real goal", () => {
  const result = boardFromTracks(fixture);

  it("draws each player close to where they actually were", () => {
    // The measurement that matters for runs. Everything else here is per frame — was
    // this player found, is this position within two metres — and a run is none of
    // those. A board can pass all of them while drawing a run that bends the wrong way,
    // because the fitted curve is never compared to anything.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const f = fidelity(result);
    expect(f.medianM).toBeLessThan(0.5);
    expect(f.p90M).toBeLessThan(1.5);
  });

  it("draws no run that leaves the play behind entirely", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fidelity(result).maxM).toBeLessThan(6);
  });
});
