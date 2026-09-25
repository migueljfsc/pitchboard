import { describe, expect, it } from "vitest";
import { addAnnotation, deleteAnnotation, draftAnnotation } from "./annotations";
import { lightsAnything } from "./highlights";
import { deleteLink } from "./links";
import { setHighlight } from "./scenes";
import { createBoardDoc } from "@/formations";
import type { BoardDoc } from "./types";

const withZone = (): { doc: BoardDoc; id: string } => {
  const base = createBoardDoc();
  const ann = draftAnnotation(base, "rect", base.scenes[0].id, { x: 10, y: 10 }, { x: 30, y: 20 }, { color: "#ffffff" });
  return { doc: addAnnotation(base, ann), id: ann.id };
};

// Drawings and links can be lit as well as players, so a key can outlive what it names.
describe("highlights on drawings and links", () => {
  it("drops a drawing's highlight when the drawing is deleted", () => {
    const { doc, id } = withZone();
    const lit = setHighlight(doc, 0, [id], "#fff");
    expect(lit.scenes[0].highlight).toEqual({ [id]: "#fff" });
    expect(deleteAnnotation(lit, id).scenes[0].highlight).toBeUndefined();
  });

  it("drops a link's highlight when the link is deleted, and keeps the others", () => {
    const doc = createBoardDoc();
    const link = doc.links[0];
    const player = doc.teams[0].players[1].id;
    const lit = setHighlight(setHighlight(doc, 0, [link.id], "#fff"), 0, [player], "#f59e0b");
    expect(deleteLink(lit, link.id).scenes[0].highlight).toEqual({ [player]: "#f59e0b" });
  });

  it("counts a scene as lit only when its highlight names something still on the board", () => {
    const { doc, id } = withZone();
    expect(lightsAnything(doc, setHighlight(doc, 0, [id], "#fff").scenes[0])).toBe(true);
    const stale = { ...doc.scenes[0], highlight: { "ann-gone": "#fff" } };
    expect(lightsAnything(doc, stale)).toBe(false);
    expect(lightsAnything(doc, doc.scenes[0])).toBe(false);
  });
});
