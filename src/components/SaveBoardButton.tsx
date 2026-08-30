/**
 * Save, in the top bar beside Export and Share.
 *
 * The board autosaves to the account every few seconds once it is linked, so this is not the
 * only thing standing between an edit and the server — it is the button you press when you
 * want to KNOW. Which is why it answers: it says "Saved" only when the server took it, and
 * `saveNow` reports that rather than being assumed.
 *
 * A board that has never been saved has no row to update, so the first press asks where it
 * should live. That is the one question the library used to carry in a strip along its top,
 * and it belongs on the button that raises it rather than in a view about stored boards.
 */

import { useState } from "react";
import { Check, Save } from "lucide-react";

import { PickProject } from "@/components/PickProject";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { CloudBoard } from "@/lib/useCloudBoard";
import { type Project, listProjects } from "@/share/api";

export function SaveBoardButton({ cloud, boardName }: { cloud: CloudBoard; boardName: string }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const flash = (ok: boolean) => {
    if (!ok) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  const press = async () => {
    if (cloud.board) {
      flash(await cloud.saveNow());
      return;
    }
    // Nothing to update yet. The list is fetched on the press rather than held, because most
    // sessions never touch this button and a stale list is worse than a moment's wait.
    setPicking(true);
    try {
      setProjects(await listProjects());
    } catch {
      // The picker says "no projects yet", which is the same advice either way: open Boards.
      setProjects([]);
    }
  };

  const into = async (projectId: string) => {
    setPicking(false);
    flash(await cloud.saveInto(projectId, boardName));
  };

  const busy = cloud.status.kind === "saving";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => void press()}
        disabled={busy}
        title={t(cloud.board ? "bar.save.hint" : "library.saveTo")}
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-ink-900 px-2.5 py-1.5 text-xs transition disabled:opacity-50",
          saved
            ? "border-accent text-accent"
            : "border-ink-600 text-ink-200 hover:border-accent hover:text-white",
        )}
      >
        {saved ? <Check size={13} /> : <Save size={13} />}
        {t(busy ? "boards.status.saving" : saved ? "boards.status.saved" : "bar.save")}
      </button>

      {picking && (
        <PickProject
          projects={projects}
          placement="down"
          onPick={(id) => void into(id)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
