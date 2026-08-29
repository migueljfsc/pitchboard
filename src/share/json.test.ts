import { describe, expect, it } from "vitest";
import { MAX_IMPORT_CHARS, SETUP_EXAMPLE, fromJson, toJson, toSetupJson } from "./json";
import { boardDocSchema } from "@/board/schema";
import { addSceneAfter, setCarrier } from "@/board/scenes";
import { createLink } from "@/board/links";
import { AWAY, HOME, createBoardDoc } from "@/formations";
import type { BoardDoc } from "@/board/types";
import { say } from "@/i18n/core";
import { en } from "@/i18n/en";

const ok = (text: string): BoardDoc => {
  const outcome = fromJson(text);
  if (!outcome.ok) throw new Error(outcome.error.key);
  return outcome.doc;
};

/**
 * The rejection, in English.
 *
 * Resolved through the dictionary rather than asserted as a key, so these keep
 * checking the sentence a person actually reads — and now also check that the
 * key was handed the variables it names.
 */
const failure = (text: string): string => {
  const outcome = fromJson(text);
  if (outcome.ok) throw new Error("expected a rejection");
  return say(en, outcome.error);
};

/** A board with something in every field worth losing. */
function played(): BoardDoc {
  let doc = createBoardDoc();
  const [a, b] = doc.teams[0].players.map((p) => p.id);
  doc = setCarrier(doc, 0, a);
  doc = addSceneAfter(doc, 0);
  doc = setCarrier(doc, 1, b);
  doc = createLink(doc, [a, b]);
  doc = {
    ...doc,
    name: "Press trap",
    annotations: [
      {
        id: "ann-1",
        kind: "text",
        from: doc.scenes[0].id,
        to: null,
        color: "#f59e0b",
        at: { x: 50, y: 34 },
        text: "here",
        size: 1.4,
      },
    ],
  };
  return doc;
}

describe("whole-board round trip", () => {
  it("comes back identical", () => {
    const doc = played();
    expect(ok(toJson(doc))).toEqual(doc);
  });

  it("is reported as a board, not mistaken for a setup", () => {
    const outcome = fromJson(toJson(createBoardDoc()));
    expect(outcome.ok && outcome.kind).toBe("board");
  });

  it("rejects a document that claims version 1 but is not valid", () => {
    const broken = { ...createBoardDoc(), scenes: [] };
    expect(failure(JSON.stringify(broken))).toMatch(/scenes/);
  });
});

describe("setup documents", () => {
  it("builds a board from a formation alone", () => {
    const doc = ok('{"teams":[{"formation":"3-5-2"},{"formation":"4-4-2"}]}');
    expect(doc.teams[0].formation).toBe("3-5-2");
    expect(doc.teams[1].formation).toBe("4-4-2");
    expect(doc.teams[0].players).toHaveLength(11);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("is reported as a setup", () => {
    const outcome = fromJson('{"teams":[{},{}]}');
    expect(outcome.ok && outcome.kind).toBe("setup");
  });

  it("names and numbers the eleven in formation order, keeper first", () => {
    const doc = ok(
      '{"teams":[{"players":[{"number":31,"label":"Ederson"},{"label":"Walker"}]},{}]}',
    );
    expect(doc.teams[0].players[0]).toMatchObject({ number: 31, label: "Ederson" });
    expect(doc.teams[0].players[1].label).toBe("Walker");
  });

  it("falls back to the defaults for anything left out", () => {
    const doc = ok('{"teams":[{},{}]}');
    expect(doc.teams[0].name).toBe(HOME.name);
    expect(doc.teams[1].color).toBe(AWAY.color);
    expect(doc.name).toBe(createBoardDoc().name);
  });

  it("picks a readable number colour when only the kit is given", () => {
    const dark = ok('{"teams":[{"color":"#0b1210"},{}]}');
    const light = ok('{"teams":[{"color":"#fefefe"},{}]}');
    expect(dark.teams[0].textColor).toBe("#ffffff");
    expect(light.teams[0].textColor).toBe("#0b1210");
  });

  it("resolves link members from shirt numbers", () => {
    const doc = ok(
      '{"teams":[{"formation":"4-3-3","links":[{"name":"Back 4","members":[2,5,6,3]}]},{}]}',
    );
    const link = doc.links.find((l) => l.name === "Back 4");
    expect(link?.members).toEqual(["home-2", "home-5", "home-6", "home-3"]);
    expect(link?.style).toBe("chain");
  });

  it("replaces the seeded links for a side that gives its own, and only that side", () => {
    const doc = ok('{"teams":[{"links":[{"members":[2,3]}]},{}]}');
    const homeIds = new Set(doc.teams[0].players.map((p) => p.id));
    const home = doc.links.filter((l) => l.members.every((m) => homeIds.has(m)));
    expect(home).toHaveLength(1);
    // The away side said nothing, so it keeps what its formation seeded.
    expect(doc.links.length).toBeGreaterThan(1);
  });

  it("keeps the seeded links for a side that says nothing about them", () => {
    const seeded = createBoardDoc().links.length;
    expect(ok('{"teams":[{},{}]}').links).toHaveLength(seeded);
  });

  it("takes the worked example", () => {
    const doc = ok(SETUP_EXAMPLE);
    expect(doc.name).toBe("High press");
    expect(doc.teams[0].players.find((p) => p.number === 9)?.label).toBe("Haaland");
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("names the shirt number that cannot be linked", () => {
    expect(failure('{"teams":[{"links":[{"members":[2,44]}]},{}]}')).toMatch(/44/);
  });

  it("refuses a formation it does not know, rather than quietly substituting one", () => {
    expect(failure('{"teams":[{"formation":"9-9-9"},{}]}')).toMatch(/9-9-9/);
  });

  it("refuses more players than the formation has places", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ number: i + 1 }));
    expect(failure(JSON.stringify({ teams: [{ players: twelve }, {}] }))).toMatch(/12 players/);
  });

  it("refuses two players in one shirt", () => {
    expect(
      failure('{"teams":[{"players":[{"number":7},{"number":7}]},{}]}'),
    ).toMatch(/shirt number/);
  });
});

describe("rejections", () => {
  it("says so plainly when the text is not JSON", () => {
    expect(failure("not json at all")).toMatch(/not valid JSON/);
  });

  it("refuses a file past the size cap before parsing it", () => {
    expect(failure("x".repeat(MAX_IMPORT_CHARS + 1))).toMatch(/Too large/);
  });

  it("refuses a shape that is neither a board nor a setup", () => {
    expect(failure('{"hello":"world"}')).toBeTruthy();
  });
});

describe("setup export", () => {
  it("reduces the board to what a setup can carry", () => {
    const setup = JSON.parse(toSetupJson(played()));
    expect(setup.name).toBe("Press trap");
    expect(setup.teams).toHaveLength(2);
    expect(setup.teams[0].formation).toBe(HOME.formation);
    expect(setup.teams[0].players).toHaveLength(11);
    expect(setup).not.toHaveProperty("scenes");
  });

  it("re-imports to the same squad and units", () => {
    const doc = played();
    const back = ok(toSetupJson(doc));
    expect(back.teams[0].players).toEqual(doc.teams[0].players);
    // Compared as a set: the setup form groups links by team, so links that
    // were interleaved in the document come back grouped.
    const members = (d: BoardDoc) => new Set(d.links.map((l) => l.members.join(",")));
    expect(members(back)).toEqual(members(doc));
  });

  it("drops a link spanning both teams, which no side's list can hold", () => {
    let doc = createBoardDoc();
    doc = createLink(doc, [doc.teams[0].players[0].id, doc.teams[1].players[0].id]);
    const setup = JSON.parse(toSetupJson(doc));
    const listed = setup.teams.flatMap((t: { links: unknown[] }) => t.links).length;
    expect(listed).toBe(doc.links.length - 1);
  });
});
