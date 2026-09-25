/**
 * Inter Bold's advance widths, the face every text label is set in.
 *
 * The engine cannot measure glyphs — it has no canvas outside `drawBoard`, and the hit tests
 * run with none at all — so it looks them up. The widths are the shipped font's own, measured
 * from `src/assets/fonts` in thousandths of an em with kerning off, which is how the renderer
 * draws a label (`fontKerning = "none"`). A line's width is therefore the sum of its letters
 * exactly, and the box, the panel and the words agree wherever they are drawn or grabbed.
 *
 * Two ranges: U+0020–U+017F (Latin-1 and Latin Extended-A, which covers the names of every
 * European league) and U+2010–U+2026 (dashes, quotes, the ellipsis). Zero means no glyph, and
 * anything without one falls back to `FALLBACK_ADVANCE` — generous, so an emoji or a script the
 * face lacks overflows its box rather than squeezing into one.
 */

/** The family the label face is registered under. Its own name, so the UI's `Inter` is untouched. */
export const TEXT_FONT_FAMILY = "PitchboardText";

/** An advance for a character the table does not cover, in ems. */
export const FALLBACK_ADVANCE = 0.62;

const LATIN_FROM = 0x20;
const LATIN = [
  237, 338, 551, 649, 655, 1016, 672, 339, 377, 377, 559, 679, 334, 468, 334, 388,
  674, 431, 629, 646, 676, 622, 649, 582, 651, 649, 334, 343, 679, 679, 679, 560,
  1016, 747, 662, 740, 722, 607, 587, 750, 747, 281, 584, 719, 565, 932, 762, 771,
  648, 777, 657, 655, 667, 732, 747, 1038, 738, 731, 664, 377, 388, 377, 487, 476,
  365, 581, 630, 588, 630, 596, 398, 632, 623, 271, 271, 580, 271, 913, 623, 613,
  630, 630, 407, 560, 366, 623, 600, 850, 580, 602, 573, 469, 372, 469, 679, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  237, 338, 588, 639, 762, 570, 339, 568, 623, 914, 464, 660, 679, 0, 662, 439,
  459, 679, 460, 472, 365, 628, 599, 334, 364, 333, 490, 660, 846, 881, 920, 560,
  747, 747, 747, 747, 747, 747, 1022, 740, 607, 607, 607, 607, 281, 281, 281, 281,
  760, 762, 771, 771, 771, 771, 771, 679, 771, 732, 732, 732, 732, 731, 669, 657,
  581, 581, 581, 581, 581, 581, 910, 588, 596, 596, 596, 596, 271, 271, 271, 271,
  599, 623, 613, 613, 613, 613, 613, 679, 613, 623, 623, 623, 623, 602, 630, 602,
  747, 581, 747, 581, 747, 581, 740, 588, 740, 588, 740, 588, 740, 588, 722, 754,
  760, 630, 607, 596, 607, 596, 607, 596, 607, 596, 607, 596, 750, 632, 750, 632,
  750, 632, 750, 632, 747, 623, 807, 623, 281, 271, 281, 271, 281, 271, 281, 271,
  281, 271, 865, 542, 584, 271, 719, 580, 586, 565, 271, 565, 271, 565, 395, 578,
  449, 605, 271, 762, 623, 762, 623, 762, 623, 0, 762, 623, 771, 613, 771, 613,
  771, 613, 1018, 988, 657, 407, 657, 407, 657, 407, 655, 560, 655, 560, 655, 560,
  655, 560, 667, 366, 667, 441, 667, 366, 732, 623, 732, 623, 732, 623, 732, 623,
  732, 623, 732, 623, 1038, 850, 731, 602, 731, 664, 573, 664, 573, 664, 573, 345,
];

const PUNCTUATION_FROM = 0x2010;
const PUNCTUATION = [
  468, 468, 0, 500, 1000, 0, 529, 0, 311, 311, 289, 0, 540, 532, 510, 0,
  583, 0, 474, 0, 331, 674, 1002,
];

/** One character's advance, in ems. */
export function advance(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  const table =
    code >= LATIN_FROM && code < LATIN_FROM + LATIN.length
      ? LATIN[code - LATIN_FROM]
      : code >= PUNCTUATION_FROM && code < PUNCTUATION_FROM + PUNCTUATION.length
        ? PUNCTUATION[code - PUNCTUATION_FROM]
        : 0;
  return table > 0 ? table / 1000 : code === 0xad ? 0 : FALLBACK_ADVANCE;
}

/** A run of text's width, in ems. */
export function textAdvance(text: string): number {
  let w = 0;
  for (const ch of text) w += advance(ch);
  return w;
}
