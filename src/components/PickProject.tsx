/**
 * "Which project?", asked from wherever it comes up.
 *
 * Two places ask it and they open in opposite directions: the bulk bar sits at the bottom of
 * the library and opens upwards, the save button sits in the top bar and opens down. That is
 * the only thing `placement` decides.
 *
 * The transparent sheet behind the menu is the click-away. A document listener would also have
 * to know about the dialog it might be inside and about the drag it must not interrupt; a
 * sheet cannot get either wrong.
 */

import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { Project } from "@/share/api";

export function PickProject({
  projects,
  onPick,
  onClose,
  placement = "up",
}: {
  projects: Project[];
  onPick: (projectId: string) => void;
  onClose: () => void;
  placement?: "up" | "down";
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        className={cn(
          "absolute right-0 z-50 flex max-h-56 w-52 flex-col gap-0.5 overflow-y-auto rounded border border-ink-600 bg-ink-800 p-1 shadow-lg shadow-black/40",
          placement === "up" ? "bottom-full mb-1" : "top-full mt-1",
        )}
      >
        <p className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
          {t("library.pick")}
        </p>
        {projects.length === 0 ? (
          <p className="px-1 py-0.5 text-[11px] leading-relaxed text-ink-400">
            {t("boards.noProjects")}
          </p>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onPick(project.id)}
              className="truncate rounded px-1.5 py-1 text-left text-[11px] text-ink-300 transition hover:bg-ink-700 hover:text-white"
            >
              {project.name}
            </button>
          ))
        )}
      </div>
    </>
  );
}
