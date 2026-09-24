/**
 * A number input that lets you finish typing.
 *
 * A fully controlled number input cannot be emptied. Retyping 10 as 20 goes
 * through "1" and then "", and neither is a value the document can hold, so the
 * field snaps back mid-edit and the second digit never lands. This keeps
 * whatever is typed and commits only what is inside the range; blur puts it back
 * to what the document actually says, so an abandoned edit leaves nothing
 * behind.
 *
 * Shared rather than copied — every numeric field on a board has this problem,
 * and the two that had their own copy had already drifted apart.
 */

import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  /** Hover text for the whole control, where the rule is worth more than a caption. */
  title?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals?: number;
  onCommit: (value: number) => void;
  /** Sits opposite the label — a reset link, typically. */
  action?: ReactNode;
  /** Shown greyed and inert; `title` is where to say why. */
  disabled?: boolean;
  /**
   * The selection disagrees — several players with different values. The field shows
   * `mixedLabel` rather than one of them, and typing sets them all.
   */
  mixed?: boolean;
  mixedLabel?: string;
};

export function NumberField({
  label,
  title,
  value,
  min,
  max,
  step,
  unit,
  decimals = 0,
  onCommit,
  action,
  disabled = false,
  mixed = false,
  mixedLabel,
}: Props) {
  const { locale } = useI18n();
  /** null while the field is showing the committed value rather than a draft. */
  const [draft, setDraft] = useState<string | null>(null);

  // A text field, not type="number": the browser formats a number input in the
  // OPERATING SYSTEM's locale, so an English board on a Portuguese machine showed
  // "0,0". The separator follows the app's language instead, and either one is
  // accepted when typed.
  const comma = locale === "pt";
  const shown = decimals > 0 ? value.toFixed(decimals) : String(value);
  const text = draft ?? (mixed ? "" : comma ? shown.replace(".", ",") : shown);
  const parse = (raw: string) => (raw.trim() === "" ? NaN : Number(raw.replace(",", ".")));
  const inRange = (n: number) => Number.isFinite(n) && n >= min && n <= max;

  /** Arrow keys step, as the number input they replace did. */
  const stepBy = (direction: 1 | -1) => {
    const from = draft === null ? value : parse(draft);
    const base = Number.isFinite(from) ? from : value;
    const next = Math.min(max, Math.max(min, Number((base + direction * step).toFixed(6))));
    setDraft(null);
    if (next !== value) onCommit(next);
  };

  return (
    <label className={cn("flex flex-col gap-1", disabled && "opacity-45")} title={title}>
      <span className="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-wide text-ink-400">
        {label}
        {action}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          placeholder={mixed ? mixedLabel : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parse(e.target.value);
            if (inRange(n)) onCommit(n);
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            stepBy(e.key === "ArrowUp" ? 1 : -1);
          }}
          onBlur={() => setDraft(null)}
          className="w-16 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-xs text-ink-200 outline-none placeholder:text-ink-400 focus:border-accent disabled:cursor-not-allowed"
        />
        <span className="text-[11px] text-ink-400">{unit}</span>
      </div>
    </label>
  );
}
