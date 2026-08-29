/**
 * Version dispatch, run before validation on every load.
 *
 * Share links are permanent and there is no server to rewrite them: a document
 * published today must still open years from now, whatever the schema has become
 * by then. So every path that brings a document in from outside — a share link,
 * a `.json` file, the autosave — passes through here first, and the migration
 * chain only ever grows.
 *
 * This is deliberately dull while there is one version. The point is that the
 * seam exists before the first link is published, because after that it is too
 * late to add one.
 */

import type { BoardDoc } from "./types";
import { msg, type Message } from "@/i18n/core";

/** The version this build writes. Bumped by any breaking schema change. */
export const CURRENT_VERSION = 1;

/**
 * A failure carries a message KEY, not a sentence.
 *
 * This module is pure and is reached from the app, the export worker and every
 * import path. None of them agree on a language, and a pure function has no
 * business knowing one — so the words are chosen by whoever is doing the showing.
 */
export type MigrateOutcome = { ok: true; doc: unknown } | { ok: false; error: Message };

/**
 * One step per version, keyed by the version it upgrades FROM.
 *
 * A step takes the document as the older version wrote it and returns it as the
 * next version expects. Steps run in order, so a v1 document reaching a v4 build
 * walks 1 → 2 → 3 → 4. They must never be edited once shipped: a link published
 * under the old behaviour would start opening differently.
 */
const STEPS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (doc) => ({ ...doc, version: 2, ... }),
};

export function migrate(raw: unknown): MigrateOutcome {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: msg("migrate.notABoard") };
  }

  const doc = raw as Record<string, unknown>;
  const version = doc.version;

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: msg("migrate.noVersion") };
  }

  if (version > CURRENT_VERSION) {
    return {
      ok: false,
      error: msg("migrate.tooNew", { version }),
    };
  }

  let current = doc;
  for (let v = version; v < CURRENT_VERSION; v++) {
    const step = STEPS[v];
    // A gap in the chain is a build error, not a user error, but it must not
    // hand a half-migrated document to the validator.
    if (!step) return { ok: false, error: msg("migrate.noStep", { version: v }) };
    current = step(current);
  }

  return { ok: true, doc: current };
}

/** True when a document is already at the version this build writes. */
export const isCurrent = (doc: BoardDoc): boolean => doc.version === CURRENT_VERSION;
