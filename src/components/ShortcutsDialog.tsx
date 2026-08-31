/**
 * Every keyboard shortcut the editor answers to, in one place.
 *
 * The keys are literals rather than translated strings: a symbol is the same in
 * both locales, and `i18n.test.ts` rejects a key whose two translations match.
 * What is translated is what each one does. Mouse gestures close the list as a
 * sentence for the same reason — "click" and "drag" are words, and words belong
 * in the dictionary rather than in a key cap.
 */

import { useEffect } from "react";
import { X } from "lucide-react";
import { MODIFIER } from "@/lib/platform";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";

type Row = { keys: string[]; label: MessageKey };
type Group = { title: MessageKey; rows: Row[] };

const GROUPS: Group[] = [
  {
    title: "shortcuts.group.playback",
    rows: [
      { keys: ["Space"], label: "shortcuts.playPause" },
      { keys: ["[", "]"], label: "shortcuts.scene" },
    ],
  },
  {
    title: "shortcuts.group.moving",
    rows: [
      { keys: ["←", "↑", "→", "↓"], label: "shortcuts.nudge" },
      { keys: ["⇧"], label: "shortcuts.nudgeFar" },
      { keys: ["Alt"], label: "shortcuts.thisScene" },
    ],
  },
  {
    title: "shortcuts.group.editing",
    rows: [
      { keys: [`${MODIFIER}Z`], label: "shortcuts.undo" },
      { keys: [`${MODIFIER}⇧Z`], label: "shortcuts.redo" },
      { keys: ["Del"], label: "shortcuts.deleteShape" },
      { keys: ["Esc"], label: "shortcuts.escape" },
      { keys: ["?"], label: "shortcuts.help" },
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-white">
            {t("shortcuts.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("shortcuts.close")}
            className="ml-auto flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-400">
                {t(group.title)}
              </span>
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-baseline gap-3">
                  <span className="flex w-28 shrink-0 flex-wrap gap-1">
                    {row.keys.map((key, i) =>
                      key === "+" ? (
                        <span key={i} className="text-[11px] text-ink-500">
                          +
                        </span>
                      ) : (
                        <kbd
                          key={i}
                          className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-ink-200"
                        >
                          {key}
                        </kbd>
                      ),
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-300">
                    {t(row.label)}
                  </span>
                </div>
              ))}
            </div>
          ))}

          <div className="flex flex-col gap-1.5 border-t border-ink-700 pt-3">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">
              {t("shortcuts.group.mouse")}
            </span>
            <p className="text-xs leading-relaxed text-ink-300">{t("shortcuts.mouse")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
