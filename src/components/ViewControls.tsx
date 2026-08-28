import { RotateCw } from "lucide-react";
import type { BoardDoc, PitchHalf, PitchView } from "@/board/types";
import { MAX_TOKEN_SCALE, MIN_TOKEN_SCALE, tokenScaleOf } from "@/board/pitch";
import { cn } from "@/lib/utils";

type Props = {
  view: PitchView;
  onChange: (view: PitchView) => void;
  doc: BoardDoc;
  onTokenScaleChange: (scale: number) => void;
};

const HALVES: { value: PitchHalf; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "full", label: "Full" },
  { value: "right", label: "Right" },
];

export function ViewControls({ view, onChange, doc, onTokenScaleChange }: Props) {
  const scale = tokenScaleOf(doc);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {HALVES.map((h) => (
          <button
            key={h.value}
            type="button"
            onClick={() => onChange({ ...view, half: h.value })}
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

      <label className="flex flex-col gap-1.5 pt-1">
        <span className="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-ink-400">
          Player size
          <span className="font-mono normal-case tracking-normal text-ink-300">
            {scale.toFixed(2)}x
          </span>
        </span>
        <input
          type="range"
          min={MIN_TOKEN_SCALE}
          max={MAX_TOKEN_SCALE}
          step={0.05}
          value={scale}
          onChange={(e) => onTokenScaleChange(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
        />
      </label>

      {view.half !== "full" && !view.rotated && (
        <p className="text-[11px] leading-relaxed text-ink-300">
          Half a pitch is taller than it is long, so horizontally it fits to the same height
          as the full board with space either side. Vertical fills the board instead.
        </p>
      )}
    </div>
  );
}
