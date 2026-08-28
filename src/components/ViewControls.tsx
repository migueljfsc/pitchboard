import { RotateCw } from "lucide-react";
import type { PitchHalf, PitchView } from "@/board/types";
import { cn } from "@/lib/utils";

type Props = {
  view: PitchView;
  onChange: (view: PitchView) => void;
};

const HALVES: { value: PitchHalf; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "full", label: "Full" },
  { value: "right", label: "Right" },
];

export function ViewControls({ view, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {HALVES.map((h) => (
          <button
            key={h.value}
            type="button"
            // A half pitch is taller than it is long, so it only fills a wide
            // board once turned. Picking a half orients it; the toggle below
            // still overrides.
            onClick={() =>
              onChange({ half: h.value, rotated: h.value === "full" ? view.rotated : true })
            }
            className={cn(
              "flex-1 rounded border px-1 py-1.5 text-[11px] transition",
              view.half === h.value
                ? "border-accent text-accent"
                : "border-ink-600 text-ink-400 hover:text-ink-200",
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ ...view, rotated: !view.rotated })}
        aria-pressed={view.rotated}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] transition",
          view.rotated
            ? "border-accent text-accent"
            : "border-ink-600 text-ink-400 hover:text-ink-200",
        )}
      >
        <RotateCw size={12} />
        {view.rotated ? "Vertical" : "Horizontal"}
      </button>

      {view.half !== "full" && !view.rotated && (
        <p className="text-[11px] leading-relaxed text-ink-300">
          Horizontal shows the half at the same scale as the full pitch, just re-centred.
          Vertical zooms it to fill the board.
        </p>
      )}
    </div>
  );
}
