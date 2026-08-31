/**
 * How this platform writes the command key.
 *
 * Read once from the platform rather than per render — it cannot change while the
 * page is open. Shared, because the shortcut hints and the shortcut list have to
 * agree about which key they are naming.
 */
export const MODIFIER =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
