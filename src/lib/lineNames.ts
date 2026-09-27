/**
 * A formation line's name in the reader's language — what a seeded link is called when a
 * board is made, or a formation or squad applied, in this language. Written into the
 * document then, and kept: a board does not change language when its reader does (D38).
 */

import type { LineNamer } from "@/formations";
import type { I18n } from "@/i18n/context";

export const lineNamer =
  (t: I18n["t"]): LineNamer =>
  (line) =>
    t(`line.${line.role}`, { n: line.spread.length });
