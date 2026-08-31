import { useEffect, useRef, useState } from "react";
import { UserMinus } from "lucide-react";
import type { BoardDoc, Player } from "@/board/types";
import { BALL_ID } from "@/board/types";
import { displayName, shirtClash } from "@/board/players";
import type { Carry } from "@/board/interaction";
import { entityDelayMs, entityTravelMs, sceneTravelMs } from "@/board/timeline";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/NumberField";
import { PALETTE } from "@/components/ui/palette";
import { useI18n } from "@/i18n/context";
import type { Message } from "@/i18n/core";

const CARRY_MODES = [
  { mode: "scene", key: "inspect.carry.scene" },
  { mode: "stationary", key: "inspect.carry.stationary" },
  { mode: "all", key: "inspect.carry.all" },
] as const satisfies readonly { mode: Carry; key: string }[];

type Props = {
  doc: BoardDoc;
  selection: ReadonlySet<string>;
  activeScene: number;
  canEditPaths: boolean;
  onCarrierChange: (playerId: string | null) => void;
  onClearPaths: () => void;
  /** True when a selected entity has a curved run in this scene to put back. */
  canStraighten: boolean;
  onRename: (playerId: string, label: string) => void;
  onRenumber: (playerId: string, number: number) => void;
  onTravelChange: (ms: number | null) => void;
  onDelayChange: (ms: number | null) => void;
  /** How far a move of this selection reaches forward through the scenes. */
  carry: Carry;
  onCarryChange: (carry: Carry) => void;
  onRemovePlayer: (playerId: string) => void;
  /** True when every selected entity has its run arrow hidden in this scene. */
  runsHidden: boolean;
  onRunsHiddenChange: (hidden: boolean) => void;
  /** True when every selected entity is lit in this scene. */
  highlighted: boolean;
  /** The colour the next halo takes — editor state, like the drawing colour. */
  highlightColor: string;
  /** A colour lights the selection in this colour; null puts the halos out. */
  onHighlightChange: (color: string | null) => void;
  /**
   * Bumped to put the cursor in the name field — a double-click on the board.
   * A counter rather than a boolean so renaming the same player twice in a row
   * still fires.
   */
  focusName?: number;
};

export function Inspector({
  doc,
  selection,
  activeScene,
  canEditPaths,
  onCarrierChange,
  onClearPaths,
  canStraighten,
  onRename,
  onRenumber,
  onTravelChange,
  onDelayChange,
  carry,
  onCarryChange,
  onRemovePlayer,
  runsHidden,
  onRunsHiddenChange,
  highlighted,
  highlightColor,
  onHighlightChange,
  focusName,
}: Props) {
  const { t } = useI18n();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusName) return;
    // Focusing also scrolls the sidebar to it, which matters when the board is
    // tall enough to push the panel out of view.
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [focusName]);

  const scene = doc.scenes[activeScene];
  const nameOf = (id: string) => {
    if (id === BALL_ID) return t("inspect.ballName");
    for (const team of doc.teams) {
      const p = team.players.find((x) => x.id === id);
      if (p) return `${team.name} ${displayName(doc, id)}`;
    }
    return id;
  };

  if (selection.size === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-ink-300">
        {t("inspect.empty")}
      </p>
    );
  }

  const players = [...selection].filter((id) => id !== BALL_ID);
  const only = players.length === 1 ? players[0] : null;
  const player = only ? doc.teams.flatMap((t) => t.players).find((p) => p.id === only) : null;
  const carries = only !== null && scene?.carrier === only;

  // Travel time is per-entity; a mixed selection shows the scene default.
  const sceneMs = scene?.transitionMs ?? 0;
  const ownMs = only && scene ? entityTravelMs(scene, only) : sceneMs;
  const overridden = only !== null && scene?.travel?.[only] !== undefined;
  // A wait is per-entity too, and zero unless one was set.
  const ownDelayMs = only && scene ? entityDelayMs(scene, only) : 0;
  const waits = only !== null && ownDelayMs > 0;

  return (
    // No count and no clear at the top: the section header already carries the
    // count as its badge, and clicking empty grass clears the selection.
    <div className="flex flex-col gap-3.5">
      {player ? (
        <IdentityFields
          key={player.id}
          doc={doc}
          player={player}
          nameRef={nameRef}
          onRename={onRename}
          onRenumber={onRenumber}
        />
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {[...selection].map(nameOf).join(", ")}
        </p>
      )}

      {/* Read when a drag or a nudge lands, so it has to be visible BEFORE one —
          which is exactly when something is selected. A mode you cannot see is a
          mode you forget you set. See D41. */}
      {doc.scenes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            {t("inspect.carry")}
          </span>
          <div className="flex gap-1">
            {CARRY_MODES.map(({ mode, key }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={carry === mode}
                title={t(`${key}.hint` as Message["key"])}
                onClick={() => onCarryChange(mode)}
                className={cn(
                  "flex-1 rounded border px-1 py-1.5 text-[11px] transition",
                  carry === mode
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-400 hover:text-ink-200",
                )}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Flow mode paces the whole board, so a per-entity time has nothing to
          override — hidden rather than shown doing nothing. */}
      {canEditPaths && scene && !doc.flow && (
        <div className="flex flex-col gap-2.5">
          <NumberField
            label={t("inspect.travelTime")}
            title={t("inspect.travel.hint", {
              seconds: (sceneTravelMs(scene) / 1000).toFixed(1),
            })}
            value={ownMs / 1000}
            min={0}
            max={60}
            step={0.1}
            decimals={1}
            unit={t(overridden ? "inspect.travel.unit" : "inspect.travel.default")}
            onCommit={(seconds) => onTravelChange(seconds * 1000)}
            action={
              overridden && (
                <button
                  type="button"
                  onClick={() => onTravelChange(null)}
                  className="normal-case tracking-normal text-ink-300 underline-offset-2 hover:text-white hover:underline"
                >
                  {t("inspect.matchScene")}
                </button>
              )
            }
          />

          {/* A wait is what lets one scene hold a sequence instead of two scenes
              existing only to order it — see D42. */}
          <NumberField
            label={t("inspect.delay")}
            title={t("inspect.delay.hint")}
            value={ownDelayMs / 1000}
            min={0}
            max={60}
            step={0.1}
            decimals={1}
            unit={t("inspect.travel.unit")}
            onCommit={(seconds) => onDelayChange(seconds * 1000)}
            action={
              waits && (
                <button
                  type="button"
                  onClick={() => onDelayChange(null)}
                  className="normal-case tracking-normal text-ink-300 underline-offset-2 hover:text-white hover:underline"
                >
                  {t("inspect.delay.together")}
                </button>
              )
            }
          />
        </div>
      )}

      {only && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            {t("inspect.ball", { scene: scene?.name ?? "" })}
          </span>
          <SmallButton
            icon="⚽"
            label={carries ? t("inspect.ball.release") : t("inspect.ball.give", { who: nameOf(only) })}
            title={t("inspect.ball.hint")}
            onClick={() => onCarrierChange(carries ? null : only)}
          />
        </div>
      )}

      {/* Every hint names one control. A title on the block would be inherited by
          each button in it, so two buttons doing different things would explain
          themselves with the same sentence. */}
      {canEditPaths && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            {t("inspect.run", { scene: scene?.name ?? "" })}
          </span>
          <SmallButton
            label={t("inspect.straighten")}
            title={t(canStraighten ? "inspect.straighten.hint" : "inspect.straighten.none")}
            disabled={!canStraighten}
            onClick={onClearPaths}
          />
          <SmallButton
            label={t(runsHidden ? "inspect.showRuns" : "inspect.hideRuns")}
            title={t(runsHidden ? "inspect.showRuns.hint" : "inspect.hideRuns.hint")}
            onClick={() => onRunsHiddenChange(!runsHidden)}
          />
        </div>
      )}

      {/* Unlike the run block, this is offered on scene 0 too: there is no run
          into the first scene, but there is certainly someone to watch in it.

          A swatch both lights the selection and becomes the colour the next one
          takes — the rule the drawing colour already follows. Nothing here
          carries forward: a highlight is about this moment (D47). */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">
          {t("inspect.highlight", { scene: scene?.name ?? "" })}
        </span>
        <SmallButton
          label={t(highlighted ? "inspect.highlight.off" : "inspect.highlight.on")}
          title={t(highlighted ? "inspect.highlight.off.hint" : "inspect.highlight.on.hint")}
          onClick={() => onHighlightChange(highlighted ? null : highlightColor)}
        />
        <div className="flex flex-wrap items-center gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t("inspect.highlight.colour", { color: c })}
              onClick={() => onHighlightChange(c)}
              className={cn(
                "size-4 rounded-full ring-1 transition",
                highlightColor === c ? "ring-2 ring-accent" : "ring-white/15 hover:ring-white/40",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Last, and on its own. Removing a player belongs to neither the ball nor
          the run, and sitting under either read as part of it. */}
      {player && (
        <button
          type="button"
          title={t("inspect.remove.hint")}
          onClick={() => onRemovePlayer(player.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition hover:border-red-500/60 hover:text-red-400"
        >
          <UserMinus size={13} />
          {t("inspect.remove", { who: displayName(doc, player.id) })}
        </button>
      )}
    </div>
  );
}

/**
 * Who this player is: the name and the shirt, plus what is wrong with the shirt.
 *
 * The number field holds its own text and commits only a free number. Committing
 * on every keystroke cannot work here: renumbering a 7 to 12 passes through 1 on
 * the way, and if somebody already wears 1 the edit would be refused before the
 * second digit was typed. Blur puts the field back to what the document actually
 * says, so an abandoned edit leaves nothing behind.
 */
function IdentityFields({
  doc,
  player,
  nameRef,
  onRename,
  onRenumber,
}: {
  doc: BoardDoc;
  player: Player;
  nameRef: React.RefObject<HTMLInputElement | null>;
  onRename: (playerId: string, label: string) => void;
  onRenumber: (playerId: string, number: number) => void;
}) {
  /** null while the field is showing the committed number rather than a draft. */
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(player.number);

  const wanted = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(wanted) && wanted >= 0 && wanted <= 99;
  const clash = valid ? shirtClash(doc, player.id, wanted) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("inspect.name")}</span>
          <input
            ref={nameRef}
            value={player.label}
            onChange={(e) => onRename(player.id, e.target.value)}
            placeholder={t("inspect.playerPlaceholder", { number: player.number })}
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent"
          />
        </label>
        <label className="flex w-14 shrink-0 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("inspect.number")}</span>
          <input
            type="number"
            min={0}
            max={99}
            value={text}
            aria-invalid={clash !== null}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (
                e.target.value.trim() !== "" &&
                Number.isInteger(n) &&
                n >= 0 &&
                n <= 99 &&
                !shirtClash(doc, player.id, n)
              ) {
                onRenumber(player.id, n);
              }
            }}
            onBlur={() => setDraft(null)}
            className={cn(
              "w-full rounded border bg-ink-900 px-2 py-1 font-mono text-xs outline-none transition",
              clash
                ? "border-red-500/70 text-red-300 focus:border-red-400"
                : "border-ink-600 text-ink-200 hover:border-ink-400 focus:border-accent",
            )}
          />
        </label>
      </div>

      {clash && (
        <p role="alert" className="text-[11px] leading-relaxed text-red-300">
          {t("inspect.clash", {
            who: clash.label.trim() || t("inspect.playerPlaceholder", { number: clash.number }),
            number: clash.number,
          })}
        </p>
      )}
    </div>
  );
}

function SmallButton({
  label,
  icon,
  title,
  disabled,
  onClick,
}: {
  label: string;
  /** Sits before the label. Decorative — the label already says what it does. */
  icon?: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      title={disabled ? undefined : title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-200 transition",
        "disabled:pointer-events-none disabled:opacity-40",
        !disabled && "hover:border-accent hover:text-white",
      )}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </button>
  );

  // A disabled button dispatches no mouse events, so its own title never appears —
  // and why it is disabled is exactly the hint worth reading. The pointer passes
  // through it to a wrapper that can hold one.
  return disabled ? (
    <span title={title} className="flex cursor-not-allowed flex-col">
      {button}
    </span>
  ) : (
    button
  );
}
