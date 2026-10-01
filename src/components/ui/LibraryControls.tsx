/**
 * The two controls a saved-things library needs in its panel — squad presets and drawn
 * formations alike: a square action button, and a name field that commits when it is left.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A rename field, holding its own text.
 *
 * Committed when the field is left, never on every keystroke. Signed in a keystroke is a
 * request, which is the drag-emits-a-document-per-pointermove trap wearing another coat (D26);
 * signed out it is a serialised library per character. An empty name is not a name, so leaving
 * the field blank restores what was there rather than storing nothing.
 */
export function LibraryNameInput({
  value,
  maxLength,
  onCommit,
  "aria-label": label,
}: {
  value: string;
  maxLength: number;
  onCommit: (name: string) => void;
  "aria-label": string;
}) {
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  return (
    <input
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Both leave the field, and leaving it is what commits — Escape having first put
        // the old name back, so the commit finds nothing to do.
        if (e.key === "Escape") setDraft(value);
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      }}
      aria-label={label}
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-ink-200 outline-none transition hover:border-ink-600 focus:border-accent focus:text-white"
    />
  );
}

export function LibraryButton({
  onClick,
  label,
  disabled,
  accent,
  small,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  accent?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded transition disabled:opacity-45",
        small ? "size-5" : "size-7 border",
        accent
          ? "border-accent bg-accent/15 text-accent enabled:hover:bg-accent/25"
          : small
            ? "text-ink-400 enabled:hover:text-red-300"
            : "border-ink-600 bg-ink-900 text-ink-300 enabled:hover:border-accent enabled:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
