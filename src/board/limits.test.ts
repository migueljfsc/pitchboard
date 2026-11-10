import { describe, expect, it } from "vitest";

import { createBoardDoc } from "@/formations";
import { parseStoredDoc, serialiseDoc } from "@/share/cloud";
import { MAX_ANNOTATIONS, addAnnotation, annotationsOf, duplicateAnnotation } from "./annotations";
import { MAX_LINKS, MAX_LINK_NAME, MAX_MEMBERS, createLink } from "./links";
import { setPlayerLabel } from "./players";
import { MAX_SCENES, MAX_SCENE_NAME, addSceneAfter, duplicateScene } from "./scenes";
import type { Annotation, BoardDoc } from "./types";

/** The Worker stores a board without reading it, so the schema is only ever met on the way back in. */
const reopens = (doc: BoardDoc) => parseStoredDoc(serialiseDoc(doc)) !== null;

const ball = (id: string, from: string): Annotation => ({
  id,
  kind: "ball",
  at: { x: 50, y: 30 },
  from,
  to: null,
  color: "#ffffff",
});

describe("every edit leaves a board that opens again", () => {
  it("names a link after its members within the limit", () => {
    let doc = createBoardDoc();
    const home = doc.teams[0].players.slice(0, 5);
    const names = ["Bernardo Silva", "Bruno Fernandes", "João Cancelo", "Rúben Dias", "Vitinha"];
    home.forEach((p, i) => (doc = setPlayerLabel(doc, p.id, names[i])));

    const next = createLink(doc, home.map((p) => p.id));

    expect(next.links.at(-1)!.name.length).toBeLessThanOrEqual(MAX_LINK_NAME);
    expect(reopens(next)).toBe(true);
  });

  it("links no more players than a link may hold", () => {
    const doc = createBoardDoc();
    const everyone = doc.teams.flatMap((t) => t.players.map((p) => p.id));

    const next = createLink(doc, everyone);

    expect(next.links.at(-1)!.members).toHaveLength(MAX_MEMBERS);
    expect(reopens(next)).toBe(true);
  });

  it("refuses a link past the board's limit", () => {
    let doc = createBoardDoc();
    const [a, b] = doc.teams[0].players;
    while (doc.links.length < MAX_LINKS) doc = createLink(doc, [a.id, b.id]);

    expect(createLink(doc, [a.id, b.id])).toBe(doc);
    expect(reopens(doc)).toBe(true);
  });

  it("refuses a scene past the board's limit, added or copied", () => {
    let doc = createBoardDoc();
    while (doc.scenes.length < MAX_SCENES) doc = addSceneAfter(doc, doc.scenes.length - 1);

    expect(addSceneAfter(doc, 0)).toBe(doc);
    expect(duplicateScene(doc, 0)).toBe(doc);
    expect(reopens(doc)).toBe(true);
  });

  it("cuts a copied scene's name to the limit", () => {
    const doc = createBoardDoc();
    const next = duplicateScene(doc, 0, "x".repeat(MAX_SCENE_NAME + 10));

    expect(next.scenes[1].name).toHaveLength(MAX_SCENE_NAME);
    expect(reopens(next)).toBe(true);
  });

  it("refuses a drawing past the board's limit, added or copied", () => {
    let doc = createBoardDoc();
    const from = doc.scenes[0].id;
    for (let i = 0; i < MAX_ANNOTATIONS; i++) doc = addAnnotation(doc, ball(`b${i}`, from));

    expect(annotationsOf(doc)).toHaveLength(MAX_ANNOTATIONS);
    expect(addAnnotation(doc, ball("over", from))).toBe(doc);
    expect(duplicateAnnotation(doc, "b0")).toBe(doc);
    expect(reopens(doc)).toBe(true);
  });

  it("opens a side whose name was cleared", () => {
    const doc = createBoardDoc();
    const teams = [doc.teams[0], { ...doc.teams[1], name: "" }] as BoardDoc["teams"];

    expect(reopens({ ...doc, teams })).toBe(true);
  });
});
