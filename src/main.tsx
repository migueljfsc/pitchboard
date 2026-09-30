import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./index.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nProvider } from "./i18n/react";
import { clearBoard } from "./share/local";
import { APP_PATH, HOME_STATE, cameHome, isLandingPath, wantsApp, wantsHome } from "./share/routes";
import { wasSignedIn } from "./share/signedIn";
import { readHash } from "./share/urlcodec";
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
  window.history.replaceState(null, "", window.location.pathname);
}

// The landing page is for visitors. Somebody signed in, or arriving with something for the
// editor to do, goes straight past it — before React mounts, so the landing never flashes.
// A `#d=` link at the root is a shared board, and the App opens it wherever it is.
// The logo asks for the landing page by name, and gets it whoever is signed in.
if (isLandingPath() && wantsHome()) {
  window.history.replaceState(HOME_STATE, "", `/${window.location.hash}`);
} else if (
  isLandingPath() &&
  !cameHome() &&
  !readHash(window.location.hash) &&
  (wantsApp() || wasSignedIn())
) {
  const { search, hash } = window.location;
  window.history.replaceState(null, "", `${APP_PATH}${search}${hash}`);
}

// Before the first draw, because the board canvas only redraws when the board changes: a label
// drawn once in the fallback face would stay misfitted until something else moved.
await loadBoardFonts(document.fonts);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <MotionConfig reducedMotion="user">
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </MotionConfig>
    </I18nProvider>
  </StrictMode>,
);
