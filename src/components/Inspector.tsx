import { useEffect, useRef, useState } from "react";
import { UserMinus } from "lucide-react";
import type { BoardDoc, Player } from "@/board/types";
import { BALL_ID } from "@/board/types";
import { displayName, shirtClash } from "@/board/players";
import type { Carry } from "@/board/interaction";
import { entityDelayMs, entityTravelMs, sceneTravelMs } from "@/board/timeline";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/NumberField";
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
  onClear: () => void;
  onCarrierChange: (playerId: string | null) => void;
  onClearPaths: () => void;
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
  onClear,
  onCarrierChange,
  onClearPaths,
  onRename,
  onRenumber,
  onTravelChange,
  onDelayChange,
  carry,
  onCarryChange,
  onRemovePlayer,
  runsHidden,
  onRunsHiddenChange,
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
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">
          {t("inspect.selected", { count: selection.size })}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-ink-300 underline-offset-2 hover:text-white hover:underline"
        >
          {t("inspect.clear")}
        </button>
      </div>

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
        // The rule sits on the group rather than on each control: a title on an
        // ancestor is what a child without one shows, so the whole block explains
        // itself on hover without repeating the sentence three times.
        <div className="flex flex-col gap-1.5" title={t("inspect.ball.hint")}>
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            {t("inspect.ball", { scene: scene?.name ?? "" })}
          </span>
          <SmallButton
            label={carries ? t("inspect.ball.release") : t("inspect.ball.give", { who: nameOf(only) })}
            onClick={() => onCarrierChange(carries ? null : only)}
          />
        </div>
      )}

      {player && (
        <button
          type="button"
          onClick={() => onRemovePlayer(player.id)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition hover:border-red-500/60 hover:text-red-400"
        >
          <UserMinus size={13} />
          {t("inspect.remove", { who: displayName(doc, player.id) })}
        </button>
      )}

      {canEditPaths && (
        <div className="flex flex-col gap-1.5" title={t("inspect.run.hint")}>
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            {t("inspect.run", { scene: scene?.name ?? "" })}
          </span>
          <SmallButton label={t("inspect.straighten")} onClick={onClearPaths} />
          <SmallButton
            label={t(runsHidden ? "inspect.showRuns" : "inspect.hideRuns")}
            onClick={() => onRunsHiddenChange(!runsHidden)}
          />
        </div>
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

function SmallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
    >
      {label}
    </button>
  );
}
