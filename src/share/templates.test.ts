import { describe, expect, it } from "vitest";
import { setupOf } from "./templates";
import { addSceneAfter, setSceneCamera } from "@/board/scenes";
import { addAnnotation, draftAnnotation } from "@/board/annotations";
import { createLink } from "@/board/links";
import { createBoardDoc } from "@/formations";

describe("setupOf", () => {
  let doc = addSceneAfter(addSceneAfter(createBoardDoc(), 0), 1);
  const [s1, s2] = doc.scenes;
  doc = addAnnotation(doc, draftAnnotation(doc, "rect", s1.id, { x: 10, y: 10 }, { x: 20, y: 20 }, { color: "#fff" }));
  doc = addAnnotation(doc, draftAnnotation(doc, "arrow", s2.id, { x: 30, y: 30 }, { x: 40, y: 30 }, { color: "#fff" }));
  doc = setSceneCamera(doc, 0, { at: { x: 30, y: 34 }, zoom: 2 });
  doc = createLink(doc, ["home-2", "home-5"]);
  doc = { ...doc, links: doc.links.map((l, i) => (i === doc.links.length - 1 ? { ...l, from: s2.id } : l)) };

  const setup = setupOf(doc);

  it("keeps only the first scene, with its camera", () => {
    expect(setup.scenes).toHaveLength(1);
    expect(setup.scenes[0].camera).toEqual({ at: { x: 30, y: 34 }, zoom: 2 });
  });

  it("keeps what is drawn on the first scene and nothing after it", () => {
    expect(setup.annotations?.map((a) => a.kind)).toEqual(["rect"]);
    expect(setup.annotations?.[0].to).toBeNull();
  });

  it("keeps the links showing on the first scene, open-ended", () => {
    const later = doc.links[doc.links.length - 1].id;
    expect(setup.links.some((l) => l.id === later)).toBe(false);
    expect(setup.links.every((l) => l.from === undefined && l.to === undefined)).toBe(true);
  });

});
