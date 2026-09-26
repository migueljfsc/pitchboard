import { describe, expect, it } from "vitest";
import { annotationsOf } from "@/board/annotations";
import { TOUR_ARROW, TOUR_LINK, TOUR_STEPS, TOUR_ZONE, buildTourBoard, type TourStage } from "./tour";

const board = () =>
  buildTourBoard({ board: "Tour", scene: (n) => `Scene ${n}`, link: "Back four" });

describe("the tour's board", () => {
  it("has one of everything the cards talk about", () => {
    const doc = board();
    const scenes = doc.scenes;
    expect(scenes.some((s) => Object.values(s.paths).some(Boolean))).toBe(true);
    expect(scenes.some((s) => Object.keys(s.delay ?? {}).length > 0)).toBe(true);
    expect(scenes.some((s) => Object.keys(s.highlight ?? {}).length > 0)).toBe(true);
    expect(scenes.some((s) => s.shot)).toBe(true);
    expect(new Set(scenes.map((s) => s.carrier).filter(Boolean)).size).toBeGreaterThan(1);
    expect(doc.links.map((l) => l.id)).toEqual([TOUR_LINK]);
    expect(doc.links[0].members).toHaveLength(4);
    expect(annotationsOf(doc).map((a) => a.id)).toEqual([TOUR_ARROW, TOUR_ZONE]);
  });

  it("stages every card on something the board has", () => {
    const doc = board();
    const ids = new Set(doc.teams.flatMap((t) => t.players.map((p) => p.id)));
    const shapes = new Set(annotationsOf(doc).map((a) => a.id));
    const links = new Set(doc.links.map((l) => l.id));
    for (const { id, stage } of TOUR_STEPS) {
      const s: TourStage = stage;
      if (s.scene !== undefined) expect(s.scene, id).toBeLessThan(doc.scenes.length);
      for (const p of s.select ?? []) expect(ids.has(p), `${id}: ${p}`).toBe(true);
      if (s.link) expect(links.has(s.link), id).toBe(true);
      if (s.annotation) expect(shapes.has(s.annotation), id).toBe(true);
    }
  });
});
