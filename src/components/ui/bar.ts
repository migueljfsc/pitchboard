/**
 * The top bar's button looks, shared by the triggers that live there but are owned by their
 * own components (Save, Boards, the account, the language).
 *
 * Quiet by default — a bar of a dozen outlined boxes reads as a dozen equal choices. The filled
 * primary is for a page's one call to action, such as the landing page's way into the editor.
 */

export const BAR_BUTTON =
  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-200 transition hover:bg-white/[0.06] hover:text-white";

/** The same button while its menu or dialog is open. */
export const BAR_BUTTON_OPEN = "bg-white/[0.08] text-white";

export const BAR_PRIMARY =
  "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink-900 shadow-[0_0_0_1px_rgb(251_191_36/0.35),0_6px_18px_-6px_rgb(251_191_36/0.55)] transition hover:brightness-110";

export const BAR_DIVIDER = "mx-1 h-5 w-px bg-ink-700";
