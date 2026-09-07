/**
 * JSON in and out.
 *
 * Two shapes are accepted, told apart by `version`:
 *
 *   - a full BoardDoc — what Export writes, and what you send someone so they
 *     see the play exactly as you left it;
 *   - a SETUP document — a short hand-written file naming a formation, an XI and
 *     its units, for starting a board rather than reproducing one.
 *
 * Both go through zod. A setup is turned into a board and then validated again
 * as a board, so nothing reaches the editor that the schema would reject.
 */

import { z } from "zod";
import type { BoardDoc, Link, LinkStyle, Team } from "@/board/types";
import { boardDocSchema } from "@/board/schema";
import { migrate } from "@/board/migrate";
import { replaceTeamLinks } from "@/board/links";
import { AWAY, DEFAULT_FORMATION, HOME, createBoardDoc, type TeamSpec } from "@/formations";
import { contrastOn } from "@/lib/color";
import { msg, type Message } from "@/i18n/core";
import { boardFromTracks } from "@/import";

/**
 * Cap on an imported file, well above any real board and well below anything
 * that would stall the parser. A 60-scene board with 200 annotations is a few
 * hundred KB.
 */
export const MAX_IMPORT_CHARS = 2_000_000;

// ------------------------------------------------------------------- export

export const toJson = (doc: BoardDoc): string => JSON.stringify(doc, null, 2);

/**
 * The board reduced to its setup — formation, XI and units, no scenes.
 *
 * A link spanning both teams belongs to neither side's list and is dropped; the
 * setup shape has nowhere to put it, and it is trivially redrawn.
 */
/**
 * One team reduced to its setup — formation, XI and units, no positions.
 *
 * Shared by the setup file and by squad presets, so the two cannot drift: a
 * preset is a setup team with a name on it.
 */
export function teamToSetup(doc: BoardDoc, index: 0 | 1): SetupTeam {
  const team = doc.teams[index];
  const ids = new Set(team.players.map((p) => p.id));
  const numberOf = new Map(team.players.map((p) => [p.id, p.number]));

  return {
    name: team.name,
    color: team.color,
    textColor: team.textColor,
    ...(team.pattern ? { pattern: team.pattern } : {}),
    formation: team.formation ?? DEFAULT_FORMATION,
    players: team.players.map((p) =>
      p.label ? { number: p.number, label: p.label } : { number: p.number },
    ),
    links: doc.links
      .filter((l) => l.members.every((m) => ids.has(m)))
      .map((l) => ({
        name: l.name,
        members: l.members.map((m) => numberOf.get(m)!),
        style: l.style,
        ...(l.showDistances ? { showDistances: true } : {}),
        ...(l.color ? { color: l.color } : {}),
      })),
  };
}

/**
 * The board reduced to its setup.
 *
 * A link spanning both teams belongs to neither side's list and is dropped; the
 * setup shape has nowhere to put it, and it is trivially redrawn.
 */
export function toSetupJson(doc: BoardDoc): string {
  const setup: Setup = { name: doc.name, teams: [teamToSetup(doc, 0), teamToSetup(doc, 1)] };
  return JSON.stringify(setup, null, 2);
}

// ------------------------------------------------------------------- import

export const setupPlayerSchema = z.object({
  number: z.number().int().min(0).max(99).optional(),
  label: z.string().max(40).optional(),
});

/** Members are SHIRT NUMBERS here, resolved against the team once it is built. */
export const setupLinkSchema = z.object({
  name: z.string().max(60).optional(),
  members: z.array(z.number().int().min(0).max(99)).min(2).max(11),
  style: z.enum(["chain", "polygon", "filled"]).optional(),
  color: z.string().min(1).optional(),
  showDistances: z.boolean().optional(),
});

export const setupTeamSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().min(1).optional(),
  textColor: z.string().min(1).optional(),
  pattern: z.enum(["solid", "vertical", "horizontal"]).optional(),
  formation: z.string().min(1).max(20).optional(),
  /** In formation order, keeper first. Shorter than the XI leaves the rest as the preset had them. */
  players: z.array(setupPlayerSchema).max(30).optional(),
  /** Given, these REPLACE the links the formation seeds for that side. */
  links: z.array(setupLinkSchema).max(20).optional(),
});

/**
 * Direction is deliberately absent: teams[0] attacks +x throughout the renderer
 * — team names behind their own goal, the ball's resting offset — so letting a
 * file flip it would break more than it buys.
 */
const setupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  teams: z.tuple([setupTeamSchema, setupTeamSchema]),
});

type Setup = z.infer<typeof setupSchema>;
export type SetupTeam = z.infer<typeof setupTeamSchema>;
export type SetupLink = z.infer<typeof setupLinkSchema>;

export type ImportOutcome =
  | { ok: true; doc: BoardDoc; kind: "board" | "setup" | "tracks" }
  | { ok: false; error: Message };

/**
 * A setup that parsed but cannot describe a real board.
 *
 * Carries a message KEY rather than a sentence. This module is pure and is
 * reached from the import panel, the preset library and the share link, none of
 * which agree on a language — so the words are chosen where they are shown.
 */
export class SetupError extends Error {
  readonly info: Message;

  constructor(info: Message) {
    // The key doubles as the developer-facing message, so a stack trace in the
    // console still says which failure this was.
    super(info.key);
    this.info = info;
  }
}

/**
 * Which side of an import a link failure came from.
 *
 * A discriminator rather than a ready-made "Team 1:" prefix, because a sentence
 * glued together from an English-ordered fragment and a translated remainder is
 * the one thing that reliably fails to translate.
 */
export type LinkSource = { kind: "team"; n: number } | { kind: "preset"; label: string };

/** The shape of a tracks file, told apart from a board by what only it carries. */
function isTracksFile(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.tracks) && typeof o.source === "object" && o.source !== null;
}

export function fromJson(text: string): ImportOutcome {
  if (text.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: msg("import.tooLarge", { kb: MAX_IMPORT_CHARS / 1000 }) };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: msg("import.notJson") };
  }

  // A tracks file ALSO declares `version: 1`, so it has to be told apart before the
  // board branch or it arrives as a broken board and the errors describe the wrong
  // thing entirely. `source` and `tracks` are what a board never has.
  if (isTracksFile(raw)) {
    const imported = boardFromTracks(raw);
    return imported.ok
      ? { ok: true, kind: "tracks", doc: imported.doc }
      : { ok: false, error: imported.error };
  }

  // `version` is the discriminator. A file that declares one but fails the board
  // schema is a broken board, not a setup, so say so rather than reporting the
  // confusing setup errors underneath.
  if (typeof raw === "object" && raw !== null && "version" in raw) {
    // Migrated before validation: a file saved by an older build is a board we
    // can still open, not a board we reject.
    const migrated = migrate(raw);
    if (!migrated.ok) return migrated;

    const parsed = boardDocSchema.safeParse(migrated.doc);
    return parsed.success
      ? { ok: true, kind: "board", doc: parsed.data as BoardDoc }
      : { ok: false, error: invalid(parsed.error) };
  }

  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: invalid(parsed.error) };

  try {
    return { ok: true, kind: "setup", doc: docFromSetup(parsed.data) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof SetupError ? e.info : msg("import.failed"),
    };
  }
}

function docFromSetup(setup: Setup): BoardDoc {
  const bases = [HOME, AWAY];

  const specs = setup.teams.map((t, i): TeamSpec => {
    const base = bases[i];
    const color = t.color ?? base.color;
    return {
      ...base,
      name: t.name ?? base.name,
      color,
      // Follow the kit unless told otherwise, so a file that gives only a colour
      // still has readable shirt numbers.
      textColor: t.textColor ?? (t.color ? contrastOn(color) : base.textColor),
      pattern: t.pattern ?? base.pattern,
      formation: t.formation ?? base.formation,
      squad: t.players,
    };
  }) as [TeamSpec, TeamSpec];

  const doc = createBoardDoc(specs[0], specs[1]);

  setup.teams.forEach((t, i) => {
    const built = doc.teams[i];
    if (t.formation && built.formation !== t.formation) {
      throw new SetupError(msg("import.team.unknownFormation", { n: i + 1, formation: t.formation }));
    }
    if (t.players && t.players.length > built.players.length) {
      throw new SetupError(
        msg("import.team.tooManyPlayers", {
          n: i + 1,
          listed: t.players.length,
          formation: built.formation ?? "",
          places: built.players.length,
        }),
      );
    }
    // Checked against what the FILE says, not against what came out of the
    // build: buildTeam resolves a collision by moving one player to a free
    // shirt, which is right when it picked the number itself and wrong when a
    // person typed the same one twice. Reject what was written wrong; resolve
    // what was left to us.
    if (duplicateNumber(t.players)) {
      throw new SetupError(msg("import.team.duplicateNumber", { n: i + 1 }));
    }
  });

  const links = resolveLinks(doc, setup);
  const parsed = boardDocSchema.safeParse({ ...doc, name: setup.name ?? doc.name, links });
  if (!parsed.success) throw new SetupError(invalid(parsed.error));
  return parsed.data as BoardDoc;
}

/**
 * Turn shirt numbers into player ids for one side.
 *
 * Numbers rather than ids because a number is the only stable way to name a
 * player in a file: ids are minted per board, and renumbering a player keeps
 * theirs. Shared with squad presets, which arrive the same way.
 *
 * Throws `SetupError` naming `where` — "Team 1", or the preset — so the message
 * says which side could not be resolved.
 */
export function resolveTeamLinks(team: Team, links: SetupLink[], where: LinkSource): Link[] {
  const byNumber = new Map(team.players.map((p) => [p.number, p.id]));

  /** The same failure, worded for whichever side of the import asked. */
  const failure = (what: "missing" | "duplicate", vars: Record<string, string | number> = {}) =>
    where.kind === "team"
      ? msg(`import.link.${what}.team`, { n: where.n, ...vars })
      : msg(`import.link.${what}.preset`, { label: where.label, ...vars });

  return links.map((link, k) => {
    const members = link.members.map((n) => {
      const id = byNumber.get(n);
      if (!id) throw new SetupError(failure("missing", { number: n }));
      return id;
    });
    if (new Set(members).size !== members.length) {
      throw new SetupError(failure("duplicate"));
    }
    return {
      id: `${team.id}-link-${k + 1}`,
      name: link.name ?? members.map((m) => numberFor(team, m)).join(", "),
      members,
      style: (link.style ?? "chain") as LinkStyle,
      showDistances: link.showDistances ?? false,
      ...(link.color ? { color: link.color } : {}),
    };
  });
}

/**
 * A side that lists links replaces the ones its formation seeded; a side that
 * says nothing keeps them.
 */
function resolveLinks(doc: BoardDoc, setup: Setup) {
  let next = doc;
  setup.teams.forEach((t, i) => {
    if (!t.links) return;
    const index = i as 0 | 1;
    const resolved = resolveTeamLinks(next.teams[index], t.links, { kind: "team", n: i + 1 });
    next = { ...next, links: replaceTeamLinks(next, index, resolved) };
  });
  return next.links;
}

/** True when a squad lists one shirt twice. Unnumbered players are not a clash. */
export function duplicateNumber(players?: { number?: number }[]): boolean {
  const listed = (players ?? [])
    .map((p) => p.number)
    .filter((n): n is number => n !== undefined);
  return new Set(listed).size !== listed.length;
}

const numberFor = (team: BoardDoc["teams"][0], id: string): string =>
  String(team.players.find((p) => p.id === id)?.number ?? "?");

/**
 * The first few zod issues, wrapped in a sentence that IS translated.
 *
 * Zod's own messages are English and come from the library, so the detail stays
 * technical while the frame around it does not. Honest, and better than either
 * hiding the detail or pretending a path like `teams.0.players.3.number` needs
 * translating at all.
 */
function invalid(error: z.ZodError): Message {
  return msg("import.invalid", { detail: describe(error) });
}

/** The first few zod issues, as one line a coach can act on. */
function describe(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/** A worked example, offered as the starting point in the import panel. */
export const SETUP_EXAMPLE = `{
  "name": "High press",
  "teams": [
    {
      "name": "City",
      "color": "#6cabdd",
      "formation": "4-3-3",
      "players": [
        { "number": 31, "label": "Ederson" },
        { "number": 2, "label": "Walker" },
        { "number": 5, "label": "Stones" },
        { "number": 6, "label": "Ake" },
        { "number": 3, "label": "Gvardiol" },
        { "number": 16, "label": "Rodri" },
        { "number": 20, "label": "Silva" },
        { "number": 17, "label": "De Bruyne" },
        { "number": 47, "label": "Foden" },
        { "number": 9, "label": "Haaland" },
        { "number": 10, "label": "Grealish" }
      ],
      "links": [
        { "name": "Back 4", "members": [2, 5, 6, 3], "style": "chain" },
        { "name": "Front 3", "members": [47, 9, 10], "style": "polygon" }
      ]
    },
    { "name": "Rivals", "color": "#e11d48", "formation": "4-4-2" }
  ]
}`;
