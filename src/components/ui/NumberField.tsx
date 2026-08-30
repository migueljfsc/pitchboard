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
}: Props) {
  /** null while the field is showing the committed value rather than a draft. */
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (decimals > 0 ? value.toFixed(decimals) : String(value));

  return (
    <label className="flex flex-col gap-1" title={title}>
      <span className="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-wide text-ink-400">
        {label}
        {action}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) {
              onCommit(n);
            }
          }}
          onBlur={() => setDraft(null)}
          className="w-16 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-xs text-ink-200 outline-none focus:border-accent"
        />
        <span className="text-[11px] text-ink-400">{unit}</span>
      </div>
    </label>
  );
}
