import { describe, expect, it } from "vitest";
import { AWAY, createBoardDoc } from "@/formations";
import { boardDocSchema } from "@/board/schema";
import { addPlayer, setPlayerLabel, setPlayerNumber } from "@/board/players";
import { createLink } from "@/board/links";
import { addSceneAfter } from "@/board/scenes";
import { memoryStore } from "./storage";
import {
  MAX_PRESETS,
  PRESETS_KEY,
  addPreset,
  applyPreset,
  deletePreset,
  loadPresets,
  presetFrom,
  renamePreset,
  replaceable,
  savePresets,
  updatePreset,
  type PresetLibrary,
} from "./presets";

/** A board whose home side has been named, numbered and given a unit. */
function namedBoard() {
  let doc = createBoardDoc();
  doc.teams[0].players.forEach((p, i) => {
    doc = setPlayerLabel(doc, p.id, `Player ${i + 1}`);
  });
  const back = doc.teams[0].players.slice(1, 5).map((p) => p.id);
  doc = createLink(doc, back);
  return { ...doc, teams: [{ ...doc.teams[0], name: "Arsenal" }, doc.teams[1]] } as typeof doc;
}

describe("presetFrom", () => {
  it("captures the squad's names, numbers and formation", () => {
    const doc = namedBoard();
    const preset = presetFrom(doc, 0, []);
    expect(preset.formation).toBe(doc.teams[0].formation);
    expect(preset.players?.map((p) => p.label)).toEqual(
      doc.teams[0].players.map((p) => p.label),
    );
    expect(preset.players?.map((p) => p.number)).toEqual(
      doc.teams[0].players.map((p) => p.number),
    );
  });

  it("labels itself after the team by default", () => {
    expect(presetFrom(namedBoard(), 0, []).label).toBe("Arsenal");
  });

  it("mints an id that does not collide", () => {
    const doc = namedBoard();
    let list = [presetFrom(doc, 0, [])];
    list = addPreset(list, presetFrom(doc, 0, list));
    list = addPreset(list, presetFrom(doc, 0, list));
    expect(new Set(list.map((p) => p.id)).size).toBe(3);
  });

  it("takes only that side's links", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const numbers = new Set(preset.players?.map((p) => p.number));
    for (const link of preset.links ?? [])
      for (const m of link.members) expect(numbers.has(m)).toBe(true);
  });
});

describe("applyPreset", () => {
  it("restores names and numbers onto a fresh board", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.doc.teams[0].players.map((p) => p.label)).toEqual(
      preset.players?.map((p) => p.label),
    );
    expect(outcome.doc.teams[0].name).toBe("Arsenal");
  });

  it("leaves the opponent completely alone", () => {
    const doc = createBoardDoc();
    const preset = presetFrom(namedBoard(), 0, []);
    const outcome = applyPreset(doc, 0, preset);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.doc.teams[1]).toEqual(doc.teams[1]);
  });

  it("applies to either side", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const outcome = applyPreset(createBoardDoc(), 1, preset);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.doc.teams[1].players.map((p) => p.label)).toEqual(
      preset.players?.map((p) => p.label),
    );
    // Applied to the away side it must still attack the away direction.
    expect(outcome.doc.teams[1].id).toBe(AWAY.id);
  });

  it("keeps every scene, and repositions only its own team", () => {
    let doc = createBoardDoc();
    doc = addSceneAfter(doc, 0);
    doc = addSceneAfter(doc, 1);
    const before = doc.scenes.map((s) => ({ ...s.positions }));

    const outcome = applyPreset(doc, 0, presetFrom(namedBoard(), 0, []));
    if (!outcome.ok) throw new Error(outcome.error);

    expect(outcome.doc.scenes).toHaveLength(3);
    outcome.doc.scenes.forEach((scene, i) => {
      for (const away of doc.teams[1].players) {
        expect(scene.positions[away.id]).toEqual(before[i][away.id]);
      }
    });
  });

  it("always returns a document the schema accepts", () => {
    const outcome = applyPreset(createBoardDoc(), 0, presetFrom(namedBoard(), 0, []));
    if (!outcome.ok) throw new Error(outcome.error);
    expect(boardDocSchema.safeParse(outcome.doc).success).toBe(true);
  });

  it("rejects a formation it does not know rather than silently substituting", () => {
    const preset = { ...presetFrom(namedBoard(), 0, []), formation: "9-9-9" };
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("9-9-9");
  });

  it("refuses a squad deeper than the formation rather than dropping the tail", () => {
    let doc = createBoardDoc();
    doc = addPlayer(doc, 0);
    doc = addPlayer(doc, 0);
    const preset = presetFrom(doc, 0, []);
    expect(preset.players).toHaveLength(13);

    const outcome = applyPreset(createBoardDoc(), 0, preset);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("13 players saved");
  });

  it("reports a link naming a number nobody wears", () => {
    const base = presetFrom(namedBoard(), 0, []);
    const preset = { ...base, links: [{ members: [98, 99] }] };
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("98");
  });

  it("survives a round trip through a renumbered squad", () => {
    // Renumbering keeps a player's id, so anything pairing by id rather than by
    // order would mismatch here.
    let doc = namedBoard();
    doc = setPlayerNumber(doc, doc.teams[0].players[3].id, 77);
    const preset = presetFrom(doc, 0, []);
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.doc.teams[0].players.map((p) => p.number)).toEqual(
      doc.teams[0].players.map((p) => p.number),
    );
  });

  it("round-trips a board that already had the preset applied", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const once = applyPreset(createBoardDoc(), 0, preset);
    if (!once.ok) throw new Error(once.error);
    const again = presetFrom(once.doc, 0, []);
    expect(again.players).toEqual(preset.players);
    expect(again.links).toEqual(preset.links);
  });
});

describe("the library", () => {
  it("adds, renames and deletes", () => {
    const doc = namedBoard();
    let list = addPreset([], presetFrom(doc, 0, []));
    const id = list[0].id;
    list = renamePreset(list, id, "First XI");
    expect(list[0].label).toBe("First XI");
    list = deletePreset(list, id);
    expect(list).toEqual([]);
  });

  it("replaces in place, keeping order", () => {
    const doc = namedBoard();
    let list = addPreset([], presetFrom(doc, 0, []));
    list = addPreset(list, presetFrom(doc, 0, list));
    const updated = { ...list[0], label: "Changed" };
    const next = updatePreset(list, updated);
    expect(next[0].label).toBe("Changed");
    expect(next[1].id).toBe(list[1].id);
  });

  it("caps the library", () => {
    const doc = namedBoard();
    let list: ReturnType<typeof presetFrom>[] = [];
    for (let i = 0; i < MAX_PRESETS + 10; i++) list = addPreset(list, presetFrom(doc, 0, list));
    expect(list).toHaveLength(MAX_PRESETS);
  });
});

describe("replaceable", () => {
  const doc = namedBoard();
  /** Ids are minted against the list, so build them the way the app does. */
  const saved = (list: PresetLibrary, label: string, formation?: string) => ({
    ...presetFrom(doc, 0, list, label),
    ...(formation ? { formation } : {}),
  });

  it("finds the same name in the same shape", () => {
    const list = [saved([], "Our first XI")];
    const again = presetFrom(doc, 0, list, "Our first XI");
    expect(replaceable(list, again.label, again.formation)?.id).toBe(list[0].id);
  });

  it("ignores case and surrounding space", () => {
    const list = [saved([], "Our First XI")];
    expect(replaceable(list, "  our first xi  ", list[0].formation)?.id).toBe(list[0].id);
  });

  it("does NOT match the same name in a different shape", () => {
    const list = [saved([], "Arsenal", "4-3-3")];
    expect(replaceable(list, "Arsenal", "3-5-2")).toBeNull();
  });

  it("does not match a different name in the same shape", () => {
    const list = [saved([], "Arsenal")];
    expect(replaceable(list, "Spurs", list[0].formation)).toBeNull();
  });

  it("is null against an empty library", () => {
    expect(replaceable([], "Arsenal", "4-3-3")).toBeNull();
  });

  it("replaces in place, keeping the id and the position", () => {
    const doc2 = namedBoard();
    let list = addPreset([], saved([], "Arsenal", "4-3-3"));
    list = addPreset(list, saved(list, "Spurs", "4-4-2"));
    const target = list[0];
    expect(new Set(list.map((p) => p.id)).size).toBe(2);

    const fresh = presetFrom(doc2, 0, list, "arsenal");
    const hit = replaceable(list, fresh.label, fresh.formation);
    expect(hit?.id).toBe(target.id);

    const next = updatePreset(list, { ...fresh, id: hit!.id });
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(target.id);
    expect(next[0].label).toBe("arsenal");
    expect(next[1].label).toBe("Spurs");
  });

  it("lets two shapes share a name", () => {
    let list = addPreset([], saved([], "Arsenal", "4-3-3"));
    const other = saved(list, "Arsenal", "3-5-2");
    expect(replaceable(list, other.label, other.formation)).toBeNull();
    list = addPreset(list, other);
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.formation)).toEqual(["4-3-3", "3-5-2"]);
  });
});

describe("persistence", () => {
  it("round-trips through a store", () => {
    const store = memoryStore();
    const list = addPreset([], presetFrom(namedBoard(), 0, []));
    expect(savePresets(list, store)).toBe(true);
    expect(loadPresets(store)).toEqual(list);
  });

  it("is empty when nothing is stored", () => {
    expect(loadPresets(memoryStore())).toEqual([]);
  });

  it("is empty when there is no store at all", () => {
    expect(loadPresets(null)).toEqual([]);
    expect(savePresets([], null)).toBe(false);
  });

  it("discards a library that no longer validates", () => {
    const store = memoryStore({ [PRESETS_KEY]: JSON.stringify([{ id: "x", nope: true }]) });
    expect(loadPresets(store)).toEqual([]);
  });

  it("discards malformed JSON", () => {
    expect(loadPresets(memoryStore({ [PRESETS_KEY]: "{not json" }))).toEqual([]);
  });

  it("survives a store that throws on write", () => {
    const angry = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(savePresets([], angry)).toBe(false);
  });
});
