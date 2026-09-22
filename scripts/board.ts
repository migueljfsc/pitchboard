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
 *     pnpm board ../football-tracks/work/Untitled/tracks.json --scenes
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
 * - `turns` and `loose`. What a coach reads off a board is who has the ball, scene by scene:
 *   `turns` counts the times the board hands it to the OTHER side, and `loose` the scenes
 *   that draw it with nobody. Both were a coach's report before they were columns -- a
 *   turnover the clip never had, and a through pass drawn as two movements.
 *   `--scenes` lists every scene's carrier and the track behind it, which is how either
 *   one is traced back to the file.
 * - `poss`, with `--truth`: the share of the truth board's window in which this board shows
 *   the same side on the ball, or the ball loose where the truth has it loose. The truth is
 *   the `truth.json` beside each file, through this same importer. Scored frame by frame
 *   rather than scene by scene, because two boards cut their scenes on different frames and
 *   a scene compared at its first frame is judged on event TIMING, which flatters a board
 *   sharing the truth's ball. Frames within half a second of a truth scene change are not
 *   scored, for the same reason. Sides are matched by the players the tracks follow, since
 *   a match's kit registry may name them the other way round.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createServer } from "vite";
import type { BoardDoc } from "../src/board/types.ts";
import type { Message } from "../src/i18n/core.ts";
import type { Sample, Track, TracksFile } from "../src/import/tracks.ts";

type Pitch = TracksFile["pitch"];

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
  from?: number;
  to?: number;
  players?: number;
  home?: number;
  away?: number;
  scenes?: number;
  backed?: number;
  density?: number;
  worstScene?: number;
  lastScene?: number;
  restart?: number | null;
  restartKept?: boolean;
  changes?: number;
  changesInWindow?: number;
  changesKept?: number;
  windowS?: number;
  observedPlayerS?: number;
  xFrom?: number;
  xTo?: number;
  travelM?: number;
  curves?: number;
  passes?: number;
  turns?: number;
  loose?: number;
  sceneList?: { frame: number; carrier: string | null; track?: string; ball?: string }[];
  roster?: Record<string, string[]>;
  possession?: Possession;
};

/** Frames of the truth board's window, by what this board shows on them. */
type Possession = {
  scored: number;
  right: number;
  wrongSide: number;
  invented: number;
  missed: number;
  unboarded: number;
};

/** Metres within which a track and a truth player are the same person on a frame. */
const MATCH_M = 2;
/** Seconds either side of a truth scene change that are not scored. */
const EDGE_S = 0.5;

/** The clip a path names, so `work/SNGS-151/tracks.json` reads as its clip and variant. */
function label(path: string): string {
  const name = basename(path, ".json");
  const clip = basename(dirname(path));
  return name === "tracks" ? clip : `${clip}/${name.replace(/^tracks\./, "")}`;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const showScenes = args.includes("--scenes");
const againstTruth = args.includes("--truth");
// A sweep knob, not a setting: the importer's own default is the shipped one.
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: pnpm board <tracks.json> [more...] [--json] [--scenes] [--truth]");
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, logLevel: "error" });
const { boardFromTracks } = (await server.ssrLoadModule("/src/import/index.ts")) as {
  boardFromTracks: (raw: unknown) => ImportResult;
};
const { coverage, witnessed, restartAt, handovers, splitImpossible, sideOf, onPitch } =
  (await server.ssrLoadModule("/src/import/reduce.ts")) as {
    coverage: (track: Track, from: number, to: number) => number;
    witnessed: (track: Track, from: number, to: number, tol: number) => number;
    restartAt: (ball: Sample[], pitch: Pitch, fps: number) => number | null;
    handovers: (ball: Sample[], players: Track[], fps: number) => number[];
    splitImpossible: (t: Track, fps: number, max?: number, intervalS?: number) => Track[];
    sideOf: (t: Track) => "home" | "away" | null;
    onPitch: (t: Track, pitch: Pitch) => boolean;
  };

type Side = "home" | "away";

/** Each side of `pred` -> the truth side whose players its tracks mostly follow. */
function sideMap(pred: TracksFile, truth: TracksFile): Map<Side, Side> {
  const byFrame = (file: TracksFile) => {
    const at = new Map<number, { side: Side; x: number; y: number }[]>();
    for (const t of file.tracks) {
      const side = sideOf(t);
      if (side === null) continue;
      for (const s of t.samples) {
        const list = at.get(s.f) ?? [];
        list.push({ side, x: s.x, y: s.y });
        at.set(s.f, list);
      }
    }
    return at;
  };
  const real = byFrame(truth);
  const votes = new Map<Side, Map<Side, number>>();
  for (const [f, ours] of byFrame(pred)) {
    const theirs = real.get(f);
    if (!theirs) continue;
    // Nearest first, each claimed once: the pairing `ft score` uses.
    const pairs: [number, number, number][] = [];
    ours.forEach((a, i) =>
      theirs.forEach((b, j) => {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= MATCH_M) pairs.push([d, i, j]);
      }),
    );
    pairs.sort((a, b) => a[0] - b[0]);
    const usedOurs = new Set<number>();
    const usedTheirs = new Set<number>();
    for (const [, i, j] of pairs) {
      if (usedOurs.has(i) || usedTheirs.has(j)) continue;
      usedOurs.add(i);
      usedTheirs.add(j);
      const tally = votes.get(ours[i].side) ?? new Map<Side, number>();
      tally.set(theirs[j].side, (tally.get(theirs[j].side) ?? 0) + 1);
      votes.set(ours[i].side, tally);
    }
  }
  const map = new Map<Side, Side>();
  for (const [side, tally] of votes) {
    map.set(side, [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return map;
}

/** The side a board shows on the ball at frame f: null for loose, undefined off the board. */
function sideAt(
  doc: BoardDoc,
  frames: number[],
  sources: Record<string, Track>,
  to: number,
  f: number,
): Side | null | undefined {
  if (frames.length === 0 || f < frames[0] || f > to) return undefined;
  let i = 0;
  while (i + 1 < frames.length && frames[i + 1] <= f) i++;
  const carrier = doc.scenes[i].carrier;
  if (carrier === null) return null;
  const track = sources[carrier];
  return track ? sideOf(track) : null;
}

function possession(
  file: string,
  pred: TracksFile,
  board: { doc: BoardDoc; frames: number[]; sources: Record<string, Track>; to: number },
): Possession | undefined {
  const path = resolve(dirname(file), "truth.json");
  if (resolve(file) === path) return undefined;
  let truthRaw: unknown;
  try {
    truthRaw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  const truth = boardFromTracks(truthRaw);
  if (!truth.ok) return undefined;
  const map = sideMap(pred, truthRaw as TracksFile);
  const edge = Math.round(EDGE_S * pred.source.fps);
  const n: Possession = { scored: 0, right: 0, wrongSide: 0, invented: 0, missed: 0, unboarded: 0 };
  for (let f = truth.window.from; f <= truth.window.to; f++) {
    if (truth.frames.some((e) => Math.abs(f - e) <= edge)) continue;
    const real = sideAt(truth.doc, truth.frames, truth.sources, truth.window.to, f);
    if (real === undefined) continue;
    n.scored++;
    const shown = sideAt(board.doc, board.frames, board.sources, board.to, f);
    if (shown === undefined) n.unboarded++;
    else if (shown === null && real === null) n.right++;
    else if (shown === null) n.missed++;
    else if (real === null) n.invented++;
    else if ((map.get(shown) ?? shown) === real) n.right++;
    else n.wrongSide++;
  }
  return n;
}

const rows: Row[] = files.map((file) => {
  const raw: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  const result = boardFromTracks(raw);
  if (!result.ok) return { file: label(file), ok: false, error: result.error.key };

  const { doc, window, sources, frames } = result;
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

  // How much of what the board DRAWS was actually seen.
  //
  // Every player has a position in every scene -- that is what a board is -- but a player
  // the tracker lost is drawn standing where they were last seen, and nothing on the board
  // says which is which. `observed` counts the time a player was watched; this counts the
  // POSITIONS the coach is shown, and it is the one that says whether a passage is a
  // record of the clip or a reconstruction of it.
  const tol = Math.round(0.2 * fps);
  const seen = frames.map(
    (f) =>
      ids.filter((id) => sources[id]?.samples.some((s) => Math.abs(s.f - f) <= tol)).length /
      Math.max(ids.length, 1),
  );
  const backed = seen.reduce((a, b) => a + b, 0) / Math.max(seen.length, 1);
  // What the window chooser thought it was getting: the mean share of the WINDOW each
  // fielded player was watched for. Where this is high and `backed` is low, the scenes
  // are landing in the holes rather than the passage being padded.
  const density =
    ids.reduce((sum, id) => {
      const track = sources[id];
      return sum + (track ? witnessed(track, window.from, window.to, tol) : 0);
    }, 0) / Math.max(ids.length, 1);

  // What the clip actually contains, against what the board kept of it: the restart and
  // every change of possession. These are the events a coach came to look at, and they are
  // the first thing a fidelity rule will delete -- nobody else is on screen at a kick-off.
  const doc_ = raw as TracksFile;
  const ball = doc_.ball?.samples ?? [];
  const players = doc_.tracks
    .flatMap((t) => splitImpossible(t, doc_.source.fps, undefined, doc_.source.intervalS))
    .filter((t) => sideOf(t) !== null && onPitch(t, doc_.pitch));
  const restart = restartAt(ball, doc_.pitch, doc_.source.fps);
  const changes = handovers(ball, players, doc_.source.fps);
  const inWindow = changes.filter((f) => f >= window.from && f <= window.to);
  const kept = inWindow.filter((f) => frames.some((s) => Math.abs(s - f) <= tol));

  const curves = doc.scenes.reduce(
    (n, s) => n + Object.values(s.paths).filter((p) => p !== null).length,
    0,
  );
  const passes = doc.scenes.reduce(
    (n, s, i) => n + (i > 0 && s.carrier !== null && s.carrier !== doc.scenes[i - 1].carrier ? 1 : 0),
    0,
  );
  // Over the scenes that NAME somebody: a scene with nobody on the ball between two of the
  // same side is not a turnover, and one between two sides still is.
  const named = doc.scenes.flatMap((s) => (s.carrier === null ? [] : [s.carrier.split("-")[0]]));
  const turns = named.reduce((n, side, i) => n + (i > 0 && side !== named[i - 1] ? 1 : 0), 0);
  const loose = doc.scenes.filter((s) => s.carrier === null && s.ballPos).length;
  const sceneList = doc.scenes.map((s, i) => {
    const track = s.carrier ? sources[s.carrier] : undefined;
    return {
      frame: frames[i],
      carrier: s.carrier,
      ...(track ? { track: `${track.team} ${track.id}` } : {}),
      ...(s.ballPos ? { ball: `${s.ballPos.x.toFixed(1)}, ${s.ballPos.y.toFixed(1)}` } : {}),
    };
  });

  // Who the board fields, and the track behind each: a keeper who is really a referee, or a
  // token standing still because its track is a few seconds long, is found here.
  const roster = Object.fromEntries(
    doc.teams.map((team) => [
      team.id,
      team.players.map((p) => {
        const track = sources[p.id];
        return `${p.id}=${track ? `${track.team} ${track.id}` : "?"}`;
      }),
    ]),
  );

  return {
    file: label(file),
    ok: true,
    from: window.from,
    to: window.to,
    players: ids.length,
    home: doc.teams[0].players.length,
    away: doc.teams[1].players.length,
    scenes: doc.scenes.length,
    backed,
    density,
    worstScene: Math.min(...seen),
    lastScene: seen[seen.length - 1],
    restart,
    restartKept: restart !== null && restart >= window.from && restart <= window.to,
    changes: changes.length,
    changesInWindow: inWindow.length,
    changesKept: kept.length,
    windowS,
    observedPlayerS: observed,
    xFrom: Math.min(...xs),
    xTo: Math.max(...xs),
    travelM: travel,
    curves,
    passes,
    turns,
    loose,
    sceneList,
    roster,
    possession: againstTruth ? possession(file, doc_, { doc, frames, sources, to: window.to }) : undefined,
  };
});

await server.close();

function share(p: Possession | undefined): string {
  return p && p.scored > 0 ? `${((p.right / p.scored) * 100).toFixed(0)}%` : "-";
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const head =
    "board".padEnd(24) +
    [
      "players", "H/A", "scenes", "window", "watched", "dens", "seen", "worst", "last",
      "travel", "curves", "passes", "restart", "turns", "loose",
    ]
      .map((h, i) => h.padStart([8, 7, 7, 8, 10, 7, 7, 7, 7, 8, 7, 11, 7, 6, 6][i]))
      .join("") + (againstTruth ? "poss".padStart(7) : "");
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
        `${(r.density! * 100).toFixed(0)}%`.padStart(7) +
        `${(r.backed! * 100).toFixed(0)}%`.padStart(7) +
        `${(r.worstScene! * 100).toFixed(0)}%`.padStart(7) +
        `${(r.lastScene! * 100).toFixed(0)}%`.padStart(7) +
        `${r.travelM!.toFixed(1)} m`.padStart(8) +
        String(r.curves).padStart(7) +
        `${r.changesKept}/${r.changesInWindow}/${r.changes}`.padStart(11) +
        (r.restart === null ? "  -" : r.restartKept ? "  yes" : "  LOST").padEnd(7) +
        String(r.turns).padStart(6) +
        String(r.loose).padStart(6) +
        (againstTruth ? share(r.possession).padStart(7) : ""),
    );
    if (showScenes && r.possession) {
      const p = r.possession;
      console.log(
        `    possession over ${p.scored} frames: right ${p.right}, wrong side ${p.wrongSide}, ` +
          `carrier where the ball is loose ${p.invented}, loose where somebody has it ${p.missed}, ` +
          `off this board ${p.unboarded}`,
      );
    }
    if (showScenes) {
      for (const [side, players] of Object.entries(r.roster!)) {
        console.log(`    ${side}: ${players.join("  ")}`);
      }
      for (const s of r.sceneList!) {
        const who = s.carrier === null ? "nobody" : `${s.carrier} (track ${s.track ?? "?"})`;
        console.log(`    f${String(s.frame).padEnd(5)} ${who.padEnd(28)} ${s.ball ? `ball loose at ${s.ball}` : ""}`);
      }
    }
  }
}
