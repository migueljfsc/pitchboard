/**
 * Formation groups and names as the reader reads them.
 *
 * The catalogue keys formations by id and groups them by an English heading, because those
 * are identities the engine and the documents keep. Most ids are notation ("4-3-3"), which
 * every language reads the same; the few that are words, and every heading, are shown here
 * in the reader's language.
 */

import type { I18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";

const GROUPS: Record<string, MessageKey> = {
  "Back four": "formation.group.backFour",
  "Back three": "formation.group.backThree",
  "Back five": "formation.group.backFive",
  "Back two": "formation.group.backTwo",
  Zones: "formation.group.zones",
  Combination: "formation.group.combination",
  Defence: "formation.group.defence",
  Rotation: "formation.group.rotation",
  "Serve receive": "formation.group.serveReceive",
};

const NAMES: Record<string, MessageKey> = {
  "W-receive": "formation.name.wReceive",
  "3-receive": "formation.name.threeReceive",
  "Box-and-1": "formation.name.boxAndOne",
};

export const groupLabel = (t: I18n["t"], group: string): string => (GROUPS[group] ? t(GROUPS[group]) : group);

export const formationLabel = (t: I18n["t"], id: string): string => (NAMES[id] ? t(NAMES[id]) : id);
