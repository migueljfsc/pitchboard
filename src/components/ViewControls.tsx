import { Box, RotateCw } from "lucide-react";
import type { BoardDoc, PitchHalf, PitchView } from "@/board/types";
import { framingOf } from "@/board/projection";
import { DEFAULT_TOKEN_SCALE, MAX_TOKEN_SCALE, MIN_TOKEN_SCALE, tokenScaleOf } from "@/board/pitch";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

type Props = {
  view: PitchView;
  onChange: (view: PitchView) => void;
  /**
   * Both omitted for read-only playback, which hides the player-size slider.
   *
   * Framing is presentation and belongs to whoever is looking (D12); token size
   * is document state (D18). A viewer may reframe a shared board all it likes
   * and may not resize its players.
   */
  doc?: BoardDoc;
  onTokenScaleChange?: (scale: number) => void;
  /**
   * False on a shared board, where the crop is the sharer's and not the
   * viewer's (D35). Rotation and 3D stay available — those are how you look at
   * a board; the crop is part of what was being shown.
   */
  showHalves?: boolean;
};

const HALVES: { value: PitchHalf; key: "view.left" | "view.full" | "view.right" }[] = [
  { value: "left", key: "view.left" },
  { value: "full", key: "view.full" },
  { value: "right", key: "view.right" },
];

export function ViewControls({
  view,
  onChange,
  doc,
  onTokenScaleChange,
  showHalves = true,
}: Props) {
  const { t } = useI18n();
  const scale = doc ? tokenScaleOf(doc) : DEFAULT_TOKEN_SCALE;
  // What the board is actually drawn as. Tilt forces vertical for rendering
  // WITHOUT rewriting view.rotated, so the flat orientation survives a trip
  // through 3D and comes back as it was.
  const framing = framingOf(view);
  return (
    <div className="flex flex-col gap-2">
      {showHalves && (
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
              {t(h.key)}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange({ ...view, rotated: !view.rotated })}
        aria-pressed={framing.rotated}
        disabled={view.tilt}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] transition",
          "disabled:cursor-not-allowed disabled:opacity-40",
          framing.rotated
            ? "border-accent text-accent"
            : "border-ink-600 text-ink-400 hover:text-ink-200",
        )}
      >
        <RotateCw size={12} />
        {t(framing.rotated ? "view.vertical" : "view.horizontal")}
      </button>

      {/* Tilt implies vertical, so it disables the rotation control rather than
          disagreeing with it — but it must not WRITE rotation, or the flat
          orientation is lost the moment you look at the board in 3D. */}
      <button
        type="button"
        onClick={() => onChange({ ...view, tilt: !view.tilt })}
        aria-pressed={!!view.tilt}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] transition",
          view.tilt
            ? "border-accent text-accent"
            : "border-ink-600 text-ink-400 hover:text-ink-200",
        )}
      >
        <Box size={12} />
        {t(view.tilt ? "view.3d" : "view.flat")}
      </button>

      {doc && onTokenScaleChange && (
        <label className="flex flex-col gap-1.5 pt-1">
          <span className="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-ink-400">
            {t("view.playerSize")}
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
      )}

      {showHalves && view.half !== "full" && !framing.rotated && (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {t("view.halfHint")}
        </p>
      )}
    </div>
  );
}
