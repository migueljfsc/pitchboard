/**
 * Per-user caps.
 *
 * D39 committed to these shipping with the feature rather than after it, and the reasoning
 * is worth repeating: free-tier limits are enforced per ACCOUNT and enforced by refusing the
 * operation, not by billing. So one abusive signup does not run up a bill — it takes the
 * board away from everybody else. Quotas are the only thing standing between a script and a
 * dead service.
 *
 * The numbers are deliberately generous for a real coach and stingy for a loop.
 */

export const MAX_PROJECTS_PER_USER = 25;
export const MAX_BOARDS_PER_USER = 200;

/**
 * How many boards one bulk move or delete may name.
 *
 * A selection is made by hand, so a hundred is already far past any real gesture — it is here
 * to bound the batch, which is a single D1 transaction and therefore a single unit of work
 * that has to finish inside a request.
 */
export const MAX_BULK_IDS = 100;

/**
 * A board document, serialised. The share-link codec budgets 8,000 characters of *compressed*
 * base64url (URL_BUDGET), so a real board is tens of kilobytes uncompressed. A quarter of a
 * megabyte is far above anything the editor produces and far below D1's response ceiling.
 */
export const MAX_DOC_BYTES = 256 * 1024;

/** Long enough for "Sunday vs Old Boys — second half press", short enough to render. */
export const MAX_NAME_CHARS = 100;

/**
 * Share slugs.
 *
 * Eight characters from an alphabet with no vowels and no look-alikes: it cannot accidentally
 * spell a word, and it survives being read down a phone or written on a whiteboard, which is
 * the entire point of having it instead of the self-contained `#d=` link.
 *
 * 27^8 is about 2.8e11. Collisions are handled by retrying against the unique index rather
 * than by trusting the arithmetic.
 */
export const SLUG_ALPHABET = "23456789bcdfghjkmnpqrstvwxz";
export const SLUG_LENGTH = 8;
export const SLUG_ATTEMPTS = 5;

/**
 * Squad presets, per account.
 *
 * Mirrors `MAX_PRESETS` in `src/share/presets.ts`, which chose it as well above what anyone
 * will keep. It was a cap on an origin's 5 MB quota there and is a cap on a free tier here,
 * but the number that matters is the one a coach would notice, and fifty is not it.
 */
export const MAX_PRESETS_PER_USER = 50;

/**
 * A preset, serialised. A squad is thirty players at most, each a number and a name, plus a
 * kit and a handful of units — a couple of kilobytes. Sixteen leaves room for long names in
 * a language that spends bytes on accents, and refuses anything that is not a squad.
 */
export const MAX_PRESET_BYTES = 16 * 1024;

/** Mirrors `MAX_PRESET_LABEL` in `src/share/presets.ts`. */
export const MAX_PRESET_LABEL_CHARS = 60;

/**
 * How deep folders may nest, counting the root as depth 0.
 *
 * A cap and not an opinion about how people organise: the rail is 220 px wide and every
 * level costs indentation, so an uncapped tree eventually renders names one character at a
 * time. Five is more nesting than a season of work needs and still leaves the deepest name
 * readable.
 *
 * It is enforced in BOTH directions on a move — the new parent's depth plus the height of
 * the subtree being moved — or a deep folder dropped onto a deep parent slips past it.
 */
export const MAX_PROJECT_DEPTH = 5;
