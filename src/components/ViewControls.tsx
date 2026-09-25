import { Box, RotateCw } from "lucide-react";
import type { BoardDoc, Grass, PitchHalf, PitchView } from "@/board/types";
import { framingOf } from "@/board/projection";
import { DEFAULT_TOKEN_SCALE, MAX_TOKEN_SCALE, MIN_TOKEN_SCALE, tokenScaleOf } from "@/board/pitch";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";

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
  /** The grass is the document's too, for the same reason: an export has to match it. */
  onGrassChange?: (grass: Grass | undefined) => void;
  /**
   * False on a shared board, where the crop is the sharer's and not the
   * viewer's (D35). Rotation and 3D stay available — those are how you look at
   * a board; the crop is part of what was being shown.
   */
  showHalves?: boolean;
  /**
   * Editor only: which neighbouring scenes are outlined behind the live board.
   *
   * Presentation, like the framing — it never reaches the document and never
   * reaches an export.
   */
  ghosts?: Ghosts;
  onGhostsChange?: (ghosts: Ghosts) => void;
};

/** Neighbouring scenes to outline behind the board. */
export type Ghosts = { before: boolean; after: boolean };

/**
 * The halves, named for where they are on screen.
 *
 * A vertical board turns the pitch a quarter turn with x=0 at the bottom, so the
 * half a coach calls "left" on a horizontal board is the one they see at the
 * bottom of a vertical one. The crop is the same; only the word changes.
 */
const HALVES: { value: PitchHalf; flat: MessageKey; upright: MessageKey }[] = [
  { value: "left", flat: "view.left", upright: "view.bottom" },
  { value: "full", flat: "view.full", upright: "view.full" },
  { value: "right", flat: "view.right", upright: "view.top" },
];

export function ViewControls({
  view,
  onChange,
  doc,
  onTokenScaleChange,
  onGrassChange,
  showHalves = true,
  ghosts,
  onGhostsChange,
}: Props) {
  const { t } = useI18n();
  const scale = doc ? tokenScaleOf(doc) : DEFAULT_TOKEN_SCALE;
  // What the board is actually drawn as. Tilt forces vertical for rendering
  // WITHOUT rewriting view.rotated, so the flat orientation survives a trip
  // through 3D and comes back as it was.
  const framing = framingOf(view);
  return (
    // Compact rows, a label on the left and the control beside it: the tab is read
    // at a glance and set once, and full-width buttons for three-letter words made
    // it the tallest panel in the sidebar.
    <div className="flex flex-col gap-2">
      {showHalves && (
        <Row label={t("view.area")} title={view.half !== "full" && !framing.rotated ? t("view.halfHint") : undefined}>
          <Segmented
            options={HALVES.map((h) => ({ value: h.value, label: t(framing.rotated ? h.upright : h.flat) }))}
            value={view.half}
            onChange={(half) => onChange({ ...view, half })}
          />
        </Row>
      )}

      {/* Tilt implies vertical, so it disables the rotation control rather than
          disagreeing with it — but it must not WRITE rotation, or the flat
          orientation is lost the moment you look at the board in 3D. */}
      <Row label={t("view.board")}>
        <div className="flex flex-1 gap-1">
          <Segmented
            options={[
              { value: "flat", label: t("view.flat") },
              { value: "3d", label: t("view.3d"), icon: <Box size={11} /> },
            ]}
            value={view.tilt ? "3d" : "flat"}
            onChange={(v) => onChange({ ...view, tilt: v === "3d" })}
          />
          <button
            type="button"
            onClick={() => onChange({ ...view, rotated: !view.rotated })}
            aria-pressed={framing.rotated}
            aria-label={t(framing.rotated ? "view.vertical" : "view.horizontal")}
            title={t(framing.rotated ? "view.vertical" : "view.horizontal")}
            disabled={view.tilt}
            className={cn(
              "flex shrink-0 items-center justify-center rounded border px-1.5 transition",
              "disabled:cursor-not-allowed disabled:opacity-40",
              framing.rotated
                ? "border-accent text-accent"
                : "border-ink-600 text-ink-400 enabled:hover:text-ink-200",
            )}
          >
            <RotateCw size={12} />
          </button>
        </div>
      </Row>

      {doc && onTokenScaleChange && (
        <Row label={t("view.players")}>
          <input
            type="range"
            min={MIN_TOKEN_SCALE}
            max={MAX_TOKEN_SCALE}
            step={0.05}
            value={scale}
            aria-label={t("view.playerSize")}
            onChange={(e) => onTokenScaleChange(Number(e.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[10px] text-ink-300">
            {scale.toFixed(2)}×
          </span>
        </Row>
      )}

      {doc && onGrassChange && <GrassControls grass={doc.grass} onChange={onGrassChange} />}

      {ghosts && onGhostsChange && (
        <Row label={t("view.ghostsShort")} title={t("view.ghosts.hint")}>
          <div className="flex flex-1 gap-1">
            {(
              [
                ["before", "view.ghosts.before"],
                ["after", "view.ghosts.after"],
              ] as const
            ).map(([which, key]) => (
              <button
                key={which}
                type="button"
                aria-pressed={ghosts[which]}
                title={t("view.ghosts.hint")}
                onClick={() => onGhostsChange({ ...ghosts, [which]: !ghosts[which] })}
                className={cn(
                  "flex-1 rounded border px-1 py-0.5 text-[10px] transition",
                  ghosts[which]
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-400 hover:text-ink-200",
                )}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </Row>
      )}
    </div>
  );
}

/** A label and its control on one line. `title` explains the whole row on hover. */
function Row({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5" title={title}>
      {/* Wide enough for the longest label in either language — JOGADORES, FANTASMAS. */}
      <span className="w-[4.5rem] shrink-0 truncate text-[10px] uppercase tracking-wide text-ink-400">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A small row of mutually exclusive choices. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded border px-1 py-0.5 text-[10px] transition",
            value === o.value
              ? "border-accent text-accent"
              : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * How dark the grass is and how it is drawn. The green stays green: a coach asked for a
 * lighter or darker pitch, not a blue one, and every kit on the palette is chosen to read on it.
 */
function GrassControls({
  grass,
  onChange,
}: {
  grass: Grass | undefined;
  onChange: (grass: Grass | undefined) => void;
}) {
  const { t } = useI18n();
  const shade = grass?.shade ?? 0;
  const texture = grass?.texture ?? "stripes";
  // Absent fields are the defaults, and a board at all defaults carries no `grass` at all.
  const set = (next: Grass) => {
    const clean: Grass = {};
    if (next.shade) clean.shade = next.shade;
    if (next.texture === "natural") clean.texture = "natural";
    onChange(Object.keys(clean).length ? clean : undefined);
  };
  return (
    <>
      <Row label={t("view.grass")}>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.1}
          value={shade}
          aria-label={t("view.grass.shadeAria")}
          title={t(shade < 0 ? "view.grass.darker" : shade > 0 ? "view.grass.lighter" : "view.grass.default")}
          onChange={(e) => set({ texture, shade: Math.round(Number(e.target.value) * 10) / 10 })}
          className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
        />
      </Row>
      <Row label="">
        <Segmented
          options={[
            { value: "stripes" as const, label: t("view.grass.stripes") },
            { value: "natural" as const, label: t("view.grass.natural") },
          ]}
          value={texture}
          onChange={(value) => set({ shade, texture: value })}
        />
      </Row>
    </>
  );
}
