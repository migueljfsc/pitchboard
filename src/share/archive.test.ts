import { describe, expect, it } from "vitest";

import type { Project } from "./api";
import { boardPaths, fileName } from "./archive";

const project = (id: string, name: string, parent_id: string | null, sport: Project["sport"] = null) =>
  ({ id, name, parent_id, sport, created_at: 0, updated_at: 0 }) as Project;

const sportName = (s: string) => ({ football: "Futebol", basketball: "Basquetebol" })[s] ?? s;

describe("fileName", () => {
  it("keeps a normal name, accents included", () => {
    expect(fileName("Saída de bola", "Untitled")).toBe("Saída de bola");
  });

  it("drops what a file system refuses, and never makes a path of it", () => {
    expect(fileName('A/B\\C:D*E?"F"<G>|H', "Untitled")).toBe("A-B-C-D-E--F--G--H");
    expect(fileName("tab\there\u0000", "Untitled")).toBe("tabhere");
    expect(fileName("..hidden", "Untitled")).toBe("hidden");
  });

  it("falls back when nothing is left", () => {
    expect(fileName("   ", "Untitled")).toBe("Untitled");
    expect(fileName("///", "Untitled")).toBe("---");
  });

  it("is bounded", () => {
    expect(fileName("x".repeat(500), "Untitled").length).toBe(80);
  });
});

describe("boardPaths", () => {
  const projects = [
    project("root", "Football", null, "football"),
    project("season", "Season 26/27", "root"),
    project("away", "Away games", "season"),
    project("hoops", "Basketball", null, "basketball"),
  ];

  it("files a board under its sport, in the reader's language, then its folders", () => {
    const paths = boardPaths(
      projects,
      [
        { id: "a", name: "High press", project_id: "away" },
        { id: "b", name: "Pick and roll", project_id: "hoops" },
      ],
      sportName,
      "Untitled",
    );
    expect(paths.get("a")).toBe("Futebol/Season 26-27/Away games/High press.json");
    expect(paths.get("b")).toBe("Basquetebol/Pick and roll.json");
  });

  it("numbers boards that would share a file, ignoring case", () => {
    const paths = boardPaths(
      projects,
      [
        { id: "a", name: "Corner", project_id: "root" },
        { id: "b", name: "corner", project_id: "root" },
        { id: "c", name: "Corner", project_id: "root" },
      ],
      sportName,
      "Untitled",
    );
    expect([...paths.values()]).toEqual(["Futebol/Corner.json", "Futebol/corner (2).json", "Futebol/Corner (3).json"]);
  });

  // The rows are data: a folder that names itself as its own ancestor must not hang the download.
  it("survives a cycle and an orphan", () => {
    const broken = [project("x", "X", "y"), project("y", "Y", "x")];
    const paths = boardPaths(
      broken,
      [
        { id: "a", name: "Loop", project_id: "x" },
        { id: "b", name: "Lost", project_id: "gone" },
      ],
      sportName,
      "Untitled",
    );
    expect(paths.get("a")).toBe("Y/X/Loop.json");
    expect(paths.get("b")).toBe("Lost.json");
  });
});
