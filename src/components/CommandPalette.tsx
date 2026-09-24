/**
 * Every action the editor offers, found by typing (⌘K).
 *
 * The editor's actions live in five panels and a top bar, and several — a
 * formation for the other side, a draw tool, a scene by name — are three clicks
 * deep. This is a list of them, filtered by what is typed, run with Enter.
 *
 * It owns nothing: the editor builds the list, with every command closing over
 * whatever it needs, and this only filters and picks.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

export type Command = {
  id: string;
  label: string;
  /** Heading the command is listed under, and part of what is searched. */
  group: string;
  /** A key that does the same thing, shown beside it. */
  hint?: string;
  run: () => void;
};

/** Case- and accent-insensitive, so "formacao" finds "Formação". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Every word typed has to appear somewhere in the label or the group. */
function matches(command: Command, query: string): boolean {
  const hay = fold(`${command.group} ${command.label}`);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => commands.filter((c) => matches(c, query)), [commands, query]);
  const at = Math.min(active, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${at}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        className="flex max-h-[60vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-ink-700 px-3">
          <Search size={14} className="shrink-0 text-ink-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(at + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(at - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[at]);
              }
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-ink-400"
          />
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-400">{t("palette.empty")}</p>
        ) : (
          <ul ref={listRef} role="listbox" className="overflow-y-auto py-1">
            {shown.map((command, i) => {
              const heading = i === 0 || shown[i - 1].group !== command.group;
              return (
                <li key={command.id} role="presentation">
                  {heading && (
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      {command.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === at}
                    data-index={i}
                    onMouseMove={() => i !== at && setActive(i)}
                    onClick={() => run(command)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs transition",
                      i === at ? "bg-accent/15 text-white" : "text-ink-200",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint && (
                      <kbd className="shrink-0 rounded border border-ink-600 px-1.5 font-mono text-[10px] text-ink-400">
                        {command.hint}
                      </kbd>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
