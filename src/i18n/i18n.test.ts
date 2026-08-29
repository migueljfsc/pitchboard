import { describe, expect, it } from "vitest";
import { LOCALES, isLocale, msg, plural, say, translate, type Dictionary } from "./core";
import { detectLocale } from "./locale";
import { en } from "./en";
import { pt } from "./pt";

const DICTIONARIES: Record<string, Dictionary> = { en, pt };
const keys = Object.keys(en) as (keyof typeof en)[];

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the dictionaries", () => {
  it("cover every locale", () => {
    for (const locale of LOCALES) expect(DICTIONARIES[locale]).toBeDefined();
  });

  /**
   * The type system already forces `pt` to answer every key. What it cannot see
   * is the inside of the strings — so a `{name}` renamed on one side and not the
   * other compiles perfectly and renders "{name}" to somebody's face.
   */
  it("name the same placeholders in every locale", () => {
    const wrong: string[] = [];
    for (const key of keys) {
      for (const locale of LOCALES) {
        const theirs = placeholders(DICTIONARIES[locale][key]);
        const ours = placeholders(en[key]);
        if (theirs.join() !== ours.join()) wrong.push(`${locale}:${key}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("say something for every key", () => {
    for (const key of keys) {
      for (const locale of LOCALES) expect(DICTIONARIES[locale][key].trim()).not.toBe("");
    }
  });

  /** A pair with only one half is a plural that silently falls back to the key. */
  it("keep both halves of every plural", () => {
    for (const key of keys) {
      const other = key.replace(/\.one$/, ".other").replace(/\.other$/, ".one");
      if (other !== key) expect(keys).toContain(other);
    }
  });

  it("is actually translated, not copied", () => {
    // Proper nouns, an SI unit and a format name are the same word in both, and
    // should be. Anything joining this list is a string somebody forgot.
    const shared = keys.filter((k) => en[k] === pt[k]);
    expect(shared.sort()).toEqual([
      "app.name",
      "bar.json",
      "export.bitrate",
      "inspect.travel.unit",
      "view.3d",
      "view.horizontal",
      "view.vertical",
    ]);
  });
});

describe("translate", () => {
  it("fills placeholders", () => {
    expect(translate(en, "team.nameLabel", { n: 2 })).toBe("Name for team 2");
    expect(translate(pt, "team.nameLabel", { n: 2 })).toBe("Nome da equipa 2");
  });

  it("leaves a placeholder alone when nothing was passed for it", () => {
    expect(translate(en, "team.nameLabel")).toContain("{n}");
    expect(translate(en, "team.nameLabel", { other: 1 })).toContain("{n}");
  });

  it("resolves a message the engine handed back", () => {
    expect(say(en, msg("migrate.tooNew", { version: 9 }))).toContain("v9");
    expect(say(pt, msg("migrate.tooNew", { version: 9 }))).toContain("v9");
  });
});

describe("plural", () => {
  it("picks a form by count, and passes the count in", () => {
    expect(plural(en, "viewer.scenes", 1)).toBe("1 scene");
    expect(plural(en, "viewer.scenes", 4)).toBe("4 scenes");
    expect(plural(pt, "viewer.scenes", 1)).toBe("1 cena");
    expect(plural(pt, "viewer.scenes", 4)).toBe("4 cenas");
  });

  it("treats zero as the plural, which both languages do", () => {
    expect(plural(en, "viewer.scenes", 0)).toBe("0 scenes");
    expect(plural(pt, "viewer.scenes", 0)).toBe("0 cenas");
  });
});

describe("the locale itself", () => {
  it("recognises only what it speaks", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("pt")).toBe(true);
    for (const bad of ["fr", "", "EN", 1, null, undefined, {}]) {
      expect(isLocale(bad)).toBe(false);
    }
  });

  it("matches the browser on the base tag, so pt-PT and pt-BR both land", () => {
    expect(detectLocale(["pt-PT"])).toBe("pt");
    expect(detectLocale(["pt-BR", "en-US"])).toBe("pt");
    expect(detectLocale(["en-GB"])).toBe("en");
  });

  it("falls back to English rather than guessing", () => {
    expect(detectLocale([])).toBe("en");
    expect(detectLocale(["fr-FR", "de"])).toBe("en");
  });

  it("takes the first language it speaks, not the first listed", () => {
    expect(detectLocale(["fr", "pt", "en"])).toBe("pt");
  });
});
