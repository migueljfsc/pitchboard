import { describe, expect, it } from "vitest";
import { allRows, ancestorIds, buildTree, subtreeIds, visibleRows } from "./projects";
import type { Project } from "@/share/api";

const project = (id: string, parent_id: string | null = null): Project => ({
  id,
  name: id,
  parent_id,
  created_at: 0,
  updated_at: 0,
  boards: 0,
});

/** season > home > setpieces, season > away, and a loose folder at the root. */
const tree = [
  project("season"),
  project("home", "season"),
  project("setpieces", "home"),
  project("away", "season"),
  project("loose"),
];

const names = (rows: { project: Project }[]) => rows.map((r) => r.project.id);

describe("buildTree", () => {
  it("roots the folders with no parent and nests the rest", () => {
    const roots = buildTree(tree);
    expect(names(roots)).toEqual(["season", "loose"]);
    expect(names(roots[0].children)).toEqual(["home", "away"]);
    expect(names(roots[0].children[0].children)).toEqual(["setpieces"]);
  });

  it("counts depth from the root", () => {
    const roots = buildTree(tree);
    expect(roots[0].depth).toBe(0);
    expect(roots[0].children[0].depth).toBe(1);
    expect(roots[0].children[0].children[0].depth).toBe(2);
  });

  it("keeps the order the list arrived in, level by level", () => {
    const roots = buildTree([project("b"), project("a"), project("c", "a")]);
    expect(names(roots)).toEqual(["b", "a"]);
  });

  // The rows come over the network, so the shape is not this module's to trust.
  it("files an orphan at the root rather than losing it", () => {
    const roots = buildTree([project("stray", "no-such-folder"), project("real")]);
    expect(names(roots)).toEqual(["stray", "real"]);
    expect(roots[0].depth).toBe(0);
  });

  it("does not hang on a cycle, and drops what a cycle cannot reach", () => {
    // a -> b -> a is reachable from no root at all.
    const roots = buildTree([project("a", "b"), project("b", "a"), project("ok")]);
    expect(names(roots)).toEqual(["ok"]);
  });

  it("does not hang on a folder that is its own parent", () => {
    expect(names(buildTree([project("self", "self"), project("ok")]))).toEqual(["ok"]);
  });

  it("is empty for no projects", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("visibleRows", () => {
  const roots = buildTree(tree);

  it("shows only the roots when nothing is expanded", () => {
    expect(names(visibleRows(roots, new Set()))).toEqual(["season", "loose"]);
  });

  it("opens one level at a time", () => {
    expect(names(visibleRows(roots, new Set(["season"])))).toEqual([
      "season",
      "home",
      "away",
      "loose",
    ]);
  });

  it("does not show a grandchild whose parent is folded away", () => {
    expect(names(visibleRows(roots, new Set(["home"])))).toEqual(["season", "loose"]);
  });

  it("marks which rows open", () => {
    const rows = visibleRows(roots, new Set(["season"]));
    expect(rows.map((r) => r.hasChildren)).toEqual([true, true, false, false]);
  });

  it("allRows ignores the folding entirely", () => {
    expect(names(allRows(roots))).toEqual(["season", "home", "setpieces", "away", "loose"]);
  });
});

describe("subtreeIds", () => {
  it("includes the folder itself", () => {
    expect(subtreeIds(tree, "loose")).toEqual(new Set(["loose"]));
  });

  it("reaches every level beneath", () => {
    expect(subtreeIds(tree, "season")).toEqual(
      new Set(["season", "home", "setpieces", "away"]),
    );
  });

  it("stops at the branch it was asked about", () => {
    expect(subtreeIds(tree, "home")).toEqual(new Set(["home", "setpieces"]));
  });

  it("terminates on a cycle", () => {
    expect(subtreeIds([project("a", "b"), project("b", "a")], "a")).toEqual(new Set(["a", "b"]));
  });
});

describe("ancestorIds", () => {
  it("climbs to the root, nearest first", () => {
    expect(ancestorIds(tree, "setpieces")).toEqual(["home", "season"]);
  });

  it("is empty at the root", () => {
    expect(ancestorIds(tree, "season")).toEqual([]);
  });

  it("terminates on a cycle", () => {
    expect(ancestorIds([project("a", "b"), project("b", "a")], "a")).toEqual(["b"]);
  });
});
