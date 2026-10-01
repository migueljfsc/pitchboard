/**
 * Everything an account has saved, as one zip: every board filed as it is in the library —
 * sport, then folders — and every squad preset and drawn formation beside them.
 *
 * Built from the endpoints the library already reads, a board at a time, so there is no
 * export route on the Worker to keep in step and no response holding a whole account. A board
 * file is the same JSON the File menu exports, so any of them opens again through Import.
 */

import type { Sport } from "@/board/types";
import {
  fetchBoard,
  listAllBoards,
  listFormations,
  listPresets,
  listProjects,
  type Project,
  type StoredBoardSummary,
} from "./api";
import { zip, type ZipEntry } from "./zip";

/** Boards fetched at once: quick for a full library, gentle on the Worker. */
const PARALLEL = 4;

/** Long enough for any real board name, short enough for every file system's path limits. */
const MAX_NAME = 80;

/** A name that is a file name everywhere: no separators, no characters Windows refuses. */
export function fileName(name: string, fallback: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|]/g, "-")
    // Control characters, which no file system wants in a name.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, MAX_NAME)
    .trim();
  return clean || fallback;
}

/**
 * Where each board goes in the archive, by id.
 *
 * A folder's path walks its parents with a guard — the rows are data, not a promise, so a
 * cycle stops rather than spins — and a sport's root is named in the reader's language. Two
 * boards with one name in one folder become "Name" and "Name (2)".
 */
export function boardPaths(
  projects: Project[],
  boards: Pick<StoredBoardSummary, "id" | "name" | "project_id">[],
  sportName: (sport: Sport) => string,
  untitled: string,
): Map<string, string> {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const folderOf = (id: string): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (let p = byId.get(id); p && !seen.has(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined) {
      seen.add(p.id);
      names.unshift(p.sport ? sportName(p.sport) : fileName(p.name, untitled));
    }
    return names.join("/");
  };

  const taken = new Set<string>();
  const paths = new Map<string, string>();
  for (const board of boards) {
    const folder = folderOf(board.project_id);
    const base = `${folder ? `${folder}/` : ""}${fileName(board.name, untitled)}`;
    let path = `${base}.json`;
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = `${base} (${n}).json`;
    taken.add(path.toLowerCase());
    paths.set(board.id, path);
  }
  return paths;
}

/** Stored JSON, indented as the File menu writes it; anything unparseable goes as it was. */
function pretty(text: string): Uint8Array {
  let out = text;
  try {
    out = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Kept verbatim: a download of your data should not drop a file for being odd.
  }
  return new TextEncoder().encode(out);
}

export async function libraryArchive(labels: {
  sport: (sport: Sport) => string;
  presets: string;
  formations: string;
  untitled: string;
}): Promise<{ blob: Blob; boards: number }> {
  const [projects, summaries, presets, formations] = await Promise.all([
    listProjects(),
    listAllBoards(),
    listPresets(),
    listFormations(),
  ]);
  const paths = boardPaths(projects, summaries, labels.sport, labels.untitled);

  const entries: ZipEntry[] = [];
  const queue = [...summaries];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let summary = queue.shift(); summary; summary = queue.shift()) {
        const board = await fetchBoard(summary.id);
        entries.push({ path: paths.get(summary.id)!, data: pretty(board.doc), modified: board.updated_at });
      }
    }),
  );
  // Fetched out of order; filed in the library's order, so the archive reads the same each time.
  const order = new Map(summaries.map((s, i) => [paths.get(s.id), i]));
  entries.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));

  const presetNames = new Set<string>();
  for (const preset of presets) {
    const base = `${labels.presets}/${fileName(preset.label, labels.untitled)}`;
    let path = `${base}.json`;
    for (let n = 2; presetNames.has(path.toLowerCase()); n++) path = `${base} (${n}).json`;
    presetNames.add(path.toLowerCase());
    entries.push({ path, data: pretty(preset.body), modified: preset.updated_at });
  }

  // Drawn formations (D122), as their stored shapes with the name put back in.
  const shapeNames = new Set<string>();
  for (const row of formations) {
    const base = `${labels.formations}/${fileName(row.name, labels.untitled)}`;
    let path = `${base}.json`;
    for (let n = 2; shapeNames.has(path.toLowerCase()); n++) path = `${base} (${n}).json`;
    shapeNames.add(path.toLowerCase());
    let text = row.body;
    try {
      text = JSON.stringify({ name: row.name, ...JSON.parse(row.body) });
    } catch {
      // Kept verbatim, as a board is.
    }
    entries.push({ path, data: pretty(text), modified: row.updated_at });
  }

  return { blob: await zip(entries), boards: summaries.length };
}
