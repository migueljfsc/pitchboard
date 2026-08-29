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
import type { BoardDoc, LinkStyle } from "@/board/types";
import { boardDocSchema } from "@/board/schema";
import { AWAY, DEFAULT_FORMATION, HOME, createBoardDoc, type TeamSpec } from "@/formations";
import { contrastOn } from "@/lib/color";

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
export function toSetupJson(doc: BoardDoc): string {
  const setup: Setup = {
    name: doc.name,
    teams: doc.teams.map((team) => {
      const ids = new Set(team.players.map((p) => p.id));
      const numberOf = new Map(team.players.map((p) => [p.id, p.number]));

      return {
        name: team.name,
        color: team.color,
        textColor: team.textColor,
        formation: team.formation ?? DEFAULT_FORMATION,
        players: team.players.map((p) => (p.label ? { number: p.number, label: p.label } : { number: p.number })),
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
    }) as [SetupTeam, SetupTeam],
  };
  return JSON.stringify(setup, null, 2);
}

// ------------------------------------------------------------------- import

const setupPlayer = z.object({
  number: z.number().int().min(0).max(99).optional(),
  label: z.string().max(40).optional(),
});

/** Members are SHIRT NUMBERS here, resolved against the team once it is built. */
const setupLink = z.object({
  name: z.string().max(60).optional(),
  members: z.array(z.number().int().min(0).max(99)).min(2).max(11),
  style: z.enum(["chain", "polygon", "filled"]).optional(),
  color: z.string().min(1).optional(),
  showDistances: z.boolean().optional(),
});

const setupTeam = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().min(1).optional(),
  textColor: z.string().min(1).optional(),
  formation: z.string().min(1).max(20).optional(),
  /** In formation order, keeper first. Shorter than the XI leaves the rest as the preset had them. */
  players: z.array(setupPlayer).max(30).optional(),
  /** Given, these REPLACE the links the formation seeds for that side. */
  links: z.array(setupLink).max(20).optional(),
});

/**
 * Direction is deliberately absent: teams[0] attacks +x throughout the renderer
 * — team names behind their own goal, the ball's resting offset — so letting a
 * file flip it would break more than it buys.
 */
const setupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  teams: z.tuple([setupTeam, setupTeam]),
});

type Setup = z.infer<typeof setupSchema>;
type SetupTeam = z.infer<typeof setupTeam>;

export type ImportOutcome =
  | { ok: true; doc: BoardDoc; kind: "board" | "setup" }
  | { ok: false; error: string };

/** A setup that parsed but cannot describe a real board. */
class SetupError extends Error {}

export function fromJson(text: string): ImportOutcome {
  if (text.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: `Too large — the limit is ${MAX_IMPORT_CHARS / 1000} KB.` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }

  // `version` is the discriminator. A file that declares one but fails the board
  // schema is a broken board, not a setup, so say so rather than reporting the
  // confusing setup errors underneath.
  if (typeof raw === "object" && raw !== null && "version" in raw) {
    const parsed = boardDocSchema.safeParse(raw);
    return parsed.success
      ? { ok: true, kind: "board", doc: parsed.data as BoardDoc }
      : { ok: false, error: describe(parsed.error) };
  }

  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: describe(parsed.error) };

  try {
    return { ok: true, kind: "setup", doc: docFromSetup(parsed.data) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof SetupError ? e.message : "Could not build a board from that setup.",
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
      formation: t.formation ?? base.formation,
      squad: t.players,
    };
  }) as [TeamSpec, TeamSpec];

  const doc = createBoardDoc(specs[0], specs[1]);

  setup.teams.forEach((t, i) => {
    const built = doc.teams[i];
    if (t.formation && built.formation !== t.formation) {
      throw new SetupError(`Team ${i + 1}: "${t.formation}" is not a formation Pitchboard knows.`);
    }
    if (t.players && t.players.length > built.players.length) {
      throw new SetupError(
        `Team ${i + 1}: ${t.players.length} players listed but ${built.formation} has ${built.players.length} places.`,
      );
    }
    const numbers = built.players.map((p) => p.number);
    if (new Set(numbers).size !== numbers.length) {
      throw new SetupError(`Team ${i + 1}: two players share a shirt number.`);
    }
  });

  const links = resolveLinks(doc, setup);
  const parsed = boardDocSchema.safeParse({ ...doc, name: setup.name ?? doc.name, links });
  if (!parsed.success) throw new SetupError(describe(parsed.error));
  return parsed.data as BoardDoc;
}

/**
 * Turn shirt numbers into player ids.
 *
 * A side that lists links replaces the ones its formation seeded; a side that
 * says nothing keeps them. Seeded links are identified by membership rather than
 * by id, which survives any future change to how ids are minted.
 */
function resolveLinks(doc: BoardDoc, setup: Setup) {
  let links = doc.links;

  setup.teams.forEach((t, i) => {
    if (!t.links) return;
    const team = doc.teams[i];
    const ids = new Set(team.players.map((p) => p.id));
    const byNumber = new Map(team.players.map((p) => [p.number, p.id]));

    // Slot the replacements in where that side's links already sat, so a team
    // listing its own units does not jump to the end of the draw order.
    const owns = (l: (typeof links)[number]) => l.members.some((m) => ids.has(m));
    const firstAt = links.findIndex(owns);
    const kept = links.filter((l) => !owns(l));
    const resolved = t.links.map((link, k) => {
      const members = link.members.map((n) => {
        const id = byNumber.get(n);
        if (!id) throw new SetupError(`Team ${i + 1}: no player wears ${n}, so it cannot be linked.`);
        return id;
      });
      if (new Set(members).size !== members.length) {
        throw new SetupError(`Team ${i + 1}: a link names the same player twice.`);
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

    const at = firstAt < 0 ? kept.length : firstAt;
    links = [...kept.slice(0, at), ...resolved, ...kept.slice(at)];
  });

  return links;
}

const numberFor = (team: BoardDoc["teams"][0], id: string): string =>
  String(team.players.find((p) => p.id === id)?.number ?? "?");

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
