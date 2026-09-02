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
});
