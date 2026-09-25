import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { I18nProvider } from "./i18n/react";
import { clearBoard } from "./share/local";
import { loadBoardFonts } from "./fonts";

/**
 * Signing out leaves a fresh board, not the one you were working on.
 *
 * Done here, before React mounts, because it has to happen before anything READS the
 * scratchpad — the editor restores it in a lazy initializer, so clearing it from inside the
 * app would be a step behind. Signing out navigates to `/?fresh=1` rather than clearing on
 * the way out, so a pending autosave cannot write the board back between the clear and the
 * unload.
 */
if (new URLSearchParams(window.location.search).get("fresh") === "1") {
  clearBoard();
  window.history.replaceState(null, "", "/");
}

// Before the first draw, because the board canvas only redraws when the board changes: a label
// drawn once in the fallback face would stay misfitted until something else moved.
await loadBoardFonts(document.fonts);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
