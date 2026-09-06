/**
 * `tracks.json` in, the board it reduces to described in one line.
 *
 * The measurement that decides whether a change to the producer is worth shipping. Six
 * separate per-frame wins in the sibling repo never reached a board, and the table that
 * caught them was written by hand each time and thrown away -- so a number nobody could
 * reproduce was the only thing standing between a training run and a conclusion.
 *
 * It runs the REAL importer rather than a copy of it, through Vite so `@/` resolves and
 * no build step or extra dependency is needed:
 *
 *     pnpm board ../football-tracks/work/SNGS-151/tracks.json
 *     pnpm board ../football-tracks/work/*\/tracks.json --json
 *
 * What each column is, and why it is here rather than a fidelity score:
 *
 * - `players`, and the split between the sides. A board that fields six is wrong however
 *   accurate the six are, and a side of one is what a window chosen on the wrong passage
 *   looks like (D52).
 * - `window` and `observed` -- the player-seconds the board was actually built from,
 *   coverage times duration. Coverage alone flatters a short window and duration alone
 *   flatters interpolation.
 * - `travel` and `curves`. A board where nobody moves is a board of a stationary camera,
 *   which is what every registration gate produced when it was scored on per-frame error.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createServer } from "vite";
import type { BoardDoc } from "../src/board/types.ts";
import type { Message } from "../src/i18n/core.ts";
import type { Track } from "../src/import/tracks.ts";

/**
 * What `boardFromTracks` returns.
 *
 * Restated because the module cannot be type-imported here: it reaches the app through
 * `@/formations`, which is DOM-bound, and this project has no DOM. Only the ENVELOPE is
 * repeated -- the document and the track come from the same two files everything else
 * reads them from, so the shapes that matter are still declared once.
 */
type ImportResult =
  | {
      ok: true;
      doc: BoardDoc;
      window: { from: number; to: number };
      frames: number[];
      sources: Record<string, Track>;
    }
  | { ok: false; error: Message };

type Row = {
  file: string;
  ok: boolean;
  error?: string;
  players?: number;
  home?: number;
  away?: number;
  scenes?: number;
  windowS?: number;
  observedPlayerS?: number;
  xFrom?: number;
  xTo?: number;
  travelM?: number;
  curves?: number;
  passes?: number;
};

/** The clip a path names, so `work/SNGS-151/tracks.json` reads as its clip and variant. */
function label(path: string): string {
  const name = basename(path, ".json");
  const clip = basename(dirname(path));
  return name === "tracks" ? clip : `${clip}/${name.replace(/^tracks\./, "")}`;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: pnpm board <tracks.json> [more...] [--json]");
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, logLevel: "error" });
const { boardFromTracks } = (await server.ssrLoadModule("/src/import/index.ts")) as {
  boardFromTracks: (raw: unknown) => ImportResult;
};
const { coverage } = (await server.ssrLoadModule("/src/import/reduce.ts")) as {
  coverage: (track: Track, from: number, to: number) => number;
};

const rows: Row[] = files.map((file) => {
  const raw: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  const result = boardFromTracks(raw);
  if (!result.ok) return { file: label(file), ok: false, error: result.error.key };

  const { doc, window, sources } = result;
  const fps = (raw as { source: { fps: number } }).source.fps;
  const windowS = (window.to - window.from) / fps;
  const observed = Object.values(sources).reduce(
    (sum, track) => sum + coverage(track, window.from, window.to) * windowS,
    0,
  );

  // Travel is per player across the whole board, and the one reported is the furthest --
  // the question it answers is whether ANYTHING on this board moves.
  const ids = doc.teams.flatMap((t) => t.players.map((p) => p.id));
  let travel = 0;
  const xs: number[] = [];
  for (const id of ids) {
    let walked = 0;
    for (const [i, scene] of doc.scenes.entries()) {
      const here = scene.positions[id];
      if (!here) continue;
      xs.push(here.x);
      const before = i > 0 ? doc.scenes[i - 1].positions[id] : undefined;
      if (before) walked += Math.hypot(here.x - before.x, here.y - before.y);
    }
    travel = Math.max(travel, walked);
  }

  const curves = doc.scenes.reduce(
    (n, s) => n + Object.values(s.paths).filter((p) => p !== null).length,
    0,
  );
  const passes = doc.scenes.reduce(
    (n, s, i) => n + (i > 0 && s.carrier !== null && s.carrier !== doc.scenes[i - 1].carrier ? 1 : 0),
    0,
  );

  return {
    file: label(file),
    ok: true,
    players: ids.length,
    home: doc.teams[0].players.length,
    away: doc.teams[1].players.length,
    scenes: doc.scenes.length,
    windowS,
    observedPlayerS: observed,
    xFrom: Math.min(...xs),
    xTo: Math.max(...xs),
    travelM: travel,
    curves,
    passes,
  };
});

await server.close();

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const head =
    "board".padEnd(24) +
    ["players", "H/A", "scenes", "window", "observed", "x range", "travel", "curves", "passes"]
      .map((h, i) => h.padStart([8, 7, 7, 8, 10, 12, 8, 7, 7][i]))
      .join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const r of rows) {
    if (!r.ok) {
      console.log(r.file.padEnd(24) + `refused: ${r.error}`);
      continue;
    }
    console.log(
      r.file.padEnd(24) +
        String(r.players).padStart(8) +
        `${r.home}/${r.away}`.padStart(7) +
        String(r.scenes).padStart(7) +
        `${r.windowS!.toFixed(1)} s`.padStart(8) +
        `${r.observedPlayerS!.toFixed(0)} p·s`.padStart(10) +
        `${r.xFrom!.toFixed(0)}-${r.xTo!.toFixed(0)} m`.padStart(12) +
        `${r.travelM!.toFixed(1)} m`.padStart(8) +
        String(r.curves).padStart(7) +
        String(r.passes).padStart(7),
    );
  }
}
