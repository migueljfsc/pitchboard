import { describe, expect, it } from "vitest";
import { AWAY, createBoardDoc } from "@/formations";
import { boardDocSchema } from "@/board/schema";
import { addPlayer, setPlayerLabel, setPlayerNumber } from "@/board/players";
import { createLink } from "@/board/links";
import { addSceneAfter } from "@/board/scenes";
import { memoryStore } from "./storage";
import { say } from "@/i18n/core";
import { en } from "@/i18n/en";
import {
  MAX_PRESETS,
  PRESETS_KEY,
  addPreset,
  applyPreset,
  clearPresets,
  deletePreset,
  libraryFromRows,
  loadPresets,
  presetFrom,
  presetFromRow,
  renamePreset,
  replaceable,
  savePresets,
  serialisePreset,
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

describe("the kit", () => {
  /**
   * The kit is part of a squad — two sides in similar colours are the reason
   * patterns exist, so a preset that forgot one would hand back the ambiguity it
   * was saved to resolve.
   */
  it("survives a save and an apply", () => {
    const base = namedBoard();
    const doc = {
      ...base,
      teams: [{ ...base.teams[0], pattern: "vertical" as const }, base.teams[1]],
    } as typeof base;

    const preset = presetFrom(doc, 0, []);
    expect(preset.pattern).toBe("vertical");

    const out = applyPreset(createBoardDoc(), 0, preset);
    if (!out.ok) throw new Error(out.error.key);
    expect(out.doc.teams[0].pattern).toBe("vertical");
    expect(out.doc.teams[1].pattern).toBeUndefined();
  });

  it("is left off a preset saved from a plain kit, and applies as solid", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    expect(preset.pattern).toBeUndefined();

    const base = createBoardDoc();
    const striped = {
      ...base,
      teams: [{ ...base.teams[0], pattern: "horizontal" as const }, base.teams[1]],
    } as typeof base;

    // Same rule the colour follows: a preset states the kit, it does not inherit
    // whatever the side it lands on happened to be wearing.
    const out = applyPreset(striped, 0, preset);
    if (!out.ok) throw new Error(out.error.key);
    expect(out.doc.teams[0].pattern).toBeUndefined();
  });
});

describe("applyPreset", () => {
  it("restores names and numbers onto a fresh board", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    if (!outcome.ok) throw new Error(outcome.error.key);
    expect(outcome.doc.teams[0].players.map((p) => p.label)).toEqual(
      preset.players?.map((p) => p.label),
    );
    expect(outcome.doc.teams[0].name).toBe("Arsenal");
  });

  it("leaves the opponent completely alone", () => {
    const doc = createBoardDoc();
    const preset = presetFrom(namedBoard(), 0, []);
    const outcome = applyPreset(doc, 0, preset);
    if (!outcome.ok) throw new Error(outcome.error.key);
    expect(outcome.doc.teams[1]).toEqual(doc.teams[1]);
  });

  it("applies to either side", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const outcome = applyPreset(createBoardDoc(), 1, preset);
    if (!outcome.ok) throw new Error(outcome.error.key);
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
    if (!outcome.ok) throw new Error(outcome.error.key);

    expect(outcome.doc.scenes).toHaveLength(3);
    outcome.doc.scenes.forEach((scene, i) => {
      for (const away of doc.teams[1].players) {
        expect(scene.positions[away.id]).toEqual(before[i][away.id]);
      }
    });
  });

  it("always returns a document the schema accepts", () => {
    const outcome = applyPreset(createBoardDoc(), 0, presetFrom(namedBoard(), 0, []));
    if (!outcome.ok) throw new Error(outcome.error.key);
    expect(boardDocSchema.safeParse(outcome.doc).success).toBe(true);
  });

  it("rejects a formation it does not know rather than silently substituting", () => {
    const preset = { ...presetFrom(namedBoard(), 0, []), formation: "9-9-9" };
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(say(en, outcome.error)).toContain("9-9-9");
  });

  it("refuses a squad deeper than the formation rather than dropping the tail", () => {
    let doc = createBoardDoc();
    doc = addPlayer(doc, 0);
    doc = addPlayer(doc, 0);
    const preset = presetFrom(doc, 0, []);
    expect(preset.players).toHaveLength(13);

    const outcome = applyPreset(createBoardDoc(), 0, preset);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(say(en, outcome.error)).toContain("13 players saved");
  });

  it("reports a link naming a number nobody wears", () => {
    const base = presetFrom(namedBoard(), 0, []);
    const preset = { ...base, links: [{ members: [98, 99] }] };
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(say(en, outcome.error)).toContain("98");
  });

  it("survives a round trip through a renumbered squad", () => {
    // Renumbering keeps a player's id, so anything pairing by id rather than by
    // order would mismatch here.
    let doc = namedBoard();
    doc = setPlayerNumber(doc, doc.teams[0].players[3].id, 77);
    const preset = presetFrom(doc, 0, []);
    const outcome = applyPreset(createBoardDoc(), 0, preset);
    if (!outcome.ok) throw new Error(outcome.error.key);
    expect(outcome.doc.teams[0].players.map((p) => p.number)).toEqual(
      doc.teams[0].players.map((p) => p.number),
    );
  });

  it("round-trips a board that already had the preset applied", () => {
    const preset = presetFrom(namedBoard(), 0, []);
    const once = applyPreset(createBoardDoc(), 0, preset);
    if (!once.ok) throw new Error(once.error.key);
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

// The account's copy. The row owns the id and the label; the body is the squad, and it is
// trusted no further than the browser's own library is (D31).
describe("serialisePreset and presetFromRow", () => {
  const row = (preset: ReturnType<typeof presetFrom>, id = "row-id", label = preset.label) => ({
    id,
    label,
    body: serialisePreset(preset),
  });

  it("round-trips a squad through a row", () => {
    const preset = presetFrom(namedBoard(), 0, [], "Our first XI");
    const back = presetFromRow(row(preset));
    expect(back).toEqual({ ...preset, id: "row-id" });
  });

  it("keeps the identity out of the body", () => {
    const preset = presetFrom(namedBoard(), 0, [], "Our first XI");
    const body: unknown = JSON.parse(serialisePreset(preset));
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("label");
  });

  // A hand-written body must not be able to rename or re-address itself: the row is where
  // both live, and the row is what the server enforces.
  it("lets the row win over anything the body claims", () => {
    const preset = presetFrom(namedBoard(), 0, [], "Our first XI");
    const smuggled = JSON.stringify({ ...preset, id: "theirs", label: "Theirs" });
    expect(presetFromRow({ id: "mine", label: "Mine", body: smuggled })).toMatchObject({
      id: "mine",
      label: "Mine",
    });
  });

  it("discards a row that is not a squad", () => {
    expect(presetFromRow({ id: "a", label: "A", body: "{not json" })).toBeNull();
    expect(presetFromRow({ id: "a", label: "A", body: "[]" })).toBeNull();
    expect(presetFromRow({ id: "a", label: "A", body: '"squad"' })).toBeNull();
    expect(presetFromRow({ id: "a", label: "A", body: '{"formation":42}' })).toBeNull();
  });

  it("discards a row with no name, since a preset is a squad WITH a label", () => {
    const preset = presetFrom(namedBoard(), 0, [], "Our first XI");
    expect(presetFromRow(row(preset, "row-id", ""))).toBeNull();
  });

  // One bad row costs that squad, not the library.
  it("keeps the rows that parsed, in the order they arrived", () => {
    const doc = namedBoard();
    const first = presetFrom(doc, 0, [], "First");
    const third = presetFrom(doc, 0, [], "Third");
    const library = libraryFromRows([
      row(first, "a"),
      { id: "b", label: "Broken", body: "{" },
      row(third, "c"),
    ]);
    expect(library.map((p) => p.label)).toEqual(["First", "Third"]);
    expect(library.map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("clearPresets", () => {
  it("leaves the browser with no library at all, not an empty one", () => {
    const store = memoryStore();
    savePresets([presetFrom(namedBoard(), 0, [])], store);
    clearPresets(store);
    expect(store.getItem(PRESETS_KEY)).toBeNull();
    expect(loadPresets(store)).toEqual([]);
  });
});
