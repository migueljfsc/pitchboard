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
 * A board document, serialised. The share-link codec budgets 8,000 characters of *compressed*
 * base64url (URL_BUDGET), so a real board is tens of kilobytes uncompressed. A quarter of a
 * megabyte is far above anything the editor produces and far below D1's response ceiling.
 */
export const MAX_DOC_BYTES = 256 * 1024;

/** Long enough for "Sunday vs Old Boys — second half press", short enough to render. */
export const MAX_NAME_CHARS = 100;
