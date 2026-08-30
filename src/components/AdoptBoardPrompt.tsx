/**
 * The one-time offer to keep the local board once you sign in.
 *
 * WHY A MARKER IN THE ADDRESS. The client cannot tell a sign-in that just happened from a
 * returning visit: the OAuth callback redirects and the page loads fresh, and a thirty-day
 * cookie looks the same on day one as on day twenty. So the Worker appends `?welcome=1` to
 * the redirect it controls, and this reads it once. Without that the offer would either nag
 * on every load or need a storage key to remember it had been made.
 *
 * WHY `loadBoard()` DECIDES WHETHER TO ASK AT ALL. A stored board means somebody has actually
 * edited something — the local autosave skips its first value, so a visitor who has done
 * nothing has nothing stored. Offering to save a pristine default board is noise.
 *
 * Nothing here is destructive: the local copy stays exactly where it is either way, which is
 * what the message says and what makes "Not now" a safe answer.
 */

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useI18n } from "@/i18n/context";
import type { CloudBoard } from "@/lib/useCloudBoard";
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

export function AdoptBoardPrompt({
  cloud,
  boardName,
  signedIn,
}: {
  cloud: CloudBoard;
  boardName: string;
  signedIn: boolean;
}) {
  const { t } = useI18n();
  const [asked, setAsked] = useState(() => isWelcome() && loadBoard() !== null);

  useEffect(forgetWelcome, []);

  // A board already saved to the account has nowhere to be adopted to, and a signed-out
  // visitor cannot be offered an account.
  if (!asked || !signedIn || cloud.board) return null;

  const adopt = async () => {
    setAsked(false);
    // Newest project, or a first one named in whatever language the app is being read in —
    // the same rule as a new board's seed labels. It is a document from then on and does not
    // change when the reader does (D38).
    const projects = await listProjects();
    const target = projects[0] ?? (await createProject(t("adopt.project")));
    await cloud.saveInto(target.id, boardName);
  };

  return (
    <ConfirmDialog
      title={t("adopt.title")}
      message={t("adopt.message")}
      confirmLabel={t("adopt.confirm")}
      // Failures land on cloud.status, which the boards panel already reports. There is
      // nothing useful to say here that it does not say better.
      onConfirm={() => void adopt().catch(() => undefined)}
      onCancel={() => setAsked(false)}
    />
  );
}
