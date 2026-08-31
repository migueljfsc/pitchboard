/**
 * The one-time offer to keep what is in this browser once you sign in.
 *
 * Two things can be here and belong to nobody: the board in progress, autosaved to
 * `localStorage`, and the squad library, which lived there too until it followed the account.
 * They are one decision — "keep my stuff" — so they are one dialog. Two would also be two
 * readers of the marker below, and the first to mount would eat it.
 *
 * WHY A MARKER IN THE ADDRESS. The client cannot tell a sign-in that just happened from a
 * returning visit: the OAuth callback redirects and the page loads fresh, and a thirty-day
 * cookie looks the same on day one as on day twenty. So the Worker appends `?welcome=1` to
 * the redirect it controls, and this reads it once. Without that the offer would either nag
 * on every load or need a storage key to remember it had been made.
 *
 * WHY `loadBoard()` DECIDES WHETHER TO ASK ABOUT THE BOARD. A stored board means somebody has
 * actually edited something — the local autosave skips its first value, so a visitor who has
 * done nothing has nothing stored. Offering to save a pristine default board is noise.
 *
 * The board half is not destructive: the local copy stays where it is either way. The squad
 * half is, in the small way the message says — the browser's library is cleared once it is
 * safely on the account, because two libraries is the one thing worse than one in the wrong
 * place (see `usePresets`). It is cleared only if every squad landed.
 */

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useI18n } from "@/i18n/context";
import type { CloudBoard } from "@/lib/useCloudBoard";
import type { PresetsState } from "@/lib/usePresets";
import { createProject, listProjects } from "@/share/api";
import { loadBoard } from "@/share/local";

/** Pure: a lazy `useState` initializer must not also mutate the address (StrictMode). */
function isWelcome(): boolean {
  return new URLSearchParams(window.location.search).get("welcome") === "1";
}

function forgetWelcome(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("welcome")) return;
  url.searchParams.delete("welcome");
  // replaceState, so the hash — which may carry a shared board (D33) — survives, and a
  // refresh does not re-ask.
  window.history.replaceState(null, "", url.toString());
}

export function AdoptLocalPrompt({
  cloud,
  boardName,
  signedIn,
  presets,
}: {
  cloud: CloudBoard;
  boardName: string;
  signedIn: boolean;
  presets: PresetsState;
}) {
  const { t } = useI18n();
  const [asked, setAsked] = useState(isWelcome);
  // Both captured at mount, beside the marker: adopting empties the local library, and a
  // dialog whose message changes while it is open is a dialog that asked something else.
  const [hadBoard] = useState(() => loadBoard() !== null);
  const [hadSquads] = useState(() => presets.local.length > 0);

  useEffect(forgetWelcome, []);

  // A board already saved to the account has nowhere to be adopted to, and a signed-out
  // visitor cannot be offered an account.
  const offerBoard = hadBoard && !cloud.board;
  if (!asked || !signedIn || (!offerBoard && !hadSquads)) return null;

  const adopt = async () => {
    setAsked(false);
    if (offerBoard) {
      // Newest project, or a first one named in whatever language the app is being read in —
      // the same rule as a new board's seed labels. It is a document from then on and does not
      // change when the reader does (D38).
      const projects = await listProjects();
      const target = projects[0] ?? (await createProject(t("adopt.project")));
      await cloud.saveInto(target.id, boardName);
    }
    // Last, and separately: a board that could not be saved is no reason to leave the squads
    // behind, and this reports its own failures through the squad panel.
    if (hadSquads) await presets.adopt();
  };

  return (
    <ConfirmDialog
      title={t("adopt.title")}
      message={t(
        offerBoard && hadSquads
          ? "adopt.message.both"
          : offerBoard
            ? "adopt.message.board"
            : "adopt.message.squads",
      )}
      confirmLabel={t("adopt.confirm")}
      // Board failures land on cloud.status, which the boards panel already reports, and squad
      // failures on the library's own error line. There is nothing useful to say here that
      // either does not say better.
      onConfirm={() => void adopt().catch(() => undefined)}
      onCancel={() => setAsked(false)}
    />
  );
}
