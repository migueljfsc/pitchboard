import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  Info,
  RotateCcw,
  Route,
  Shirt,
  Undo2,
  UserMinus,
} from "lucide-react";
import type { BoardDoc, Player, RunEnd, RunStart } from "@/board/types";
import { BALL_ID } from "@/board/types";
import { displayName, keeperOf, shirtClash } from "@/board/players";
import type { Carry } from "@/board/interaction";
import {
  entityDelayMs,
  entityTravelMs,
  runEndOf,
  runStartOf,
  runsThrough,
  sceneTravelMs,
} from "@/board/timeline";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/NumberField";
import { Stepper } from "@/components/ui/Stepper";
import { PALETTE } from "@/components/ui/palette";
import { useI18n } from "@/i18n/context";
import type { Message } from "@/i18n/core";

const RUN_STARTS = [
  { value: "gradual", key: "inspect.runStart.gradual" },
  { value: "sharp", key: "inspect.runStart.sharp" },
] as const satisfies readonly { value: RunStart; key: string }[];

const RUN_ENDS = [
  { value: "gradual", key: "inspect.runEnd.gradual" },
  { value: "sharp", key: "inspect.runEnd.sharp" },
  { value: "through", key: "inspect.runEnd.through" },
] as const satisfies readonly { value: RunEnd; key: string }[];

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
  /** How the selected players' runs into this scene start and finish. */
  onRunStyleChange: (style: { start?: RunStart; end?: RunEnd }) => void;
  /** How far a move of this selection reaches forward through the scenes. */
  carry: Carry;
  onCarryChange: (carry: Carry) => void;
  onRemovePlayer: (playerId: string) => void;
  onSwitchSide: (playerId: string) => void;
  onMakeKeeper: (playerId: string) => void;
  /** True when every selected entity has its run arrow hidden in this scene. */
  runsHidden: boolean;
  onRunsHiddenChange: (hidden: boolean) => void;
  /** True when every selected entity is lit in this scene. */
  highlighted: boolean;
  /** The colour the selection is lit in here; null when it is not, or in several. */
  highlightColor: string | null;
  /** A colour lights the selection in this colour; null puts the halos out. */
  onHighlightChange: (color: string | null) => void;
  /** Jump to a scene — where a group that cannot apply here points instead. */
  onGoToScene: (index: number) => void;
  /** Take back the selected players' moves into this scene, carried as a drag is. */
  onResetMove: () => void;
  /** False when there is no move into this scene to take back. */
  canResetMove: boolean;
  /** Take away every move the selected players make, in every scene. */
  onRemoveAllMovement: () => void;
  /** False when none of them moves anywhere. */
  hasMovement: boolean;
  /** Whether the selected players' whole path through every scene is drawn. */
  trailOn: boolean;
  onTrailChange: (on: boolean) => void;
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
  onRunStyleChange,
  carry,
  onCarryChange,
  onRemovePlayer,
  onSwitchSide,
  onMakeKeeper,
  runsHidden,
  onRunsHiddenChange,
  highlighted,
  highlightColor,
  onHighlightChange,
  onGoToScene,
  onResetMove,
  canResetMove,
  onRemoveAllMovement,
  hasMovement,
  trailOn,
  onTrailChange,
  focusName,
}: Props) {
  const { t, tn } = useI18n();
  const nameRef = useRef<HTMLInputElement>(null);

  // Which tab is showing. It stays where it was left when the selection changes:
  // working down a line of players setting their runs is one tab, one click each.
  const [tab, setTab] = useState<Tab>("scene");

  // A double-click on the board asks for the name, which is on the Player tab.
  // Adjusted while rendering, so the tab is there by the time the effect below
  // puts the cursor in it.
  const [seenFocus, setSeenFocus] = useState(focusName);
  if (seenFocus !== focusName) {
    setSeenFocus(focusName);
    if (focusName) setTab("player");
  }

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
  const isKeeper = !!player && doc.teams.some((t) => keeperOf(t) === player.id);
  const carries = only !== null && scene?.carrier === only;
  const ballOnly = players.length === 0 && selection.has(BALL_ID);
  const holder = scene?.carrier ?? null;
  const carryLabel = t(CARRY_MODES.find((m) => m.mode === carry)!.key);

  // Taking back a move into this scene. On the first scene there is no scene before
  // to go back to, so it is the formation mark instead.
  const resetButton = players.length > 0 && (
    <SmallButton
      label={t(activeScene === 0 ? "inspect.resetMove.first" : "inspect.resetMove")}
      title={
        !canResetMove
          ? t(activeScene === 0 ? "inspect.resetMove.first.none" : "inspect.resetMove.none")
          : activeScene === 0
            ? t("inspect.resetMove.first.hint", { mode: carryLabel })
            : t("inspect.resetMove.hint", {
                scene: doc.scenes[activeScene - 1]?.name ?? "",
                mode: carryLabel,
              })
      }
      icon={<Undo2 size={13} />}
      disabled={!canResetMove}
      onClick={onResetMove}
    />
  );
  const tabs = player !== null && player !== undefined;
  const showing: Tab = tabs ? tab : "scene";

  // Read across the selection: the value when everyone agrees, null when not.
  const shared = <T,>(read: (id: string) => T): T | null => {
    if (!scene || players.length === 0) return null;
    const first = read(players[0]);
    return players.every((id) => read(id) === first) ? first : null;
  };

  const travel = shared((id) => entityTravelMs(scene!, id));
  const travelOwn = shared((id) => scene?.travel?.[id] !== undefined);
  const delay = shared((id) => entityDelayMs(scene!, id));
  const runStart = shared((id) => runStartOf(scene!, id));
  const runEnd = shared((id) => runEndOf(scene!, id));
  const lastScene = activeScene >= doc.scenes.length - 1;
  // Asked to run on, but a wait on the next scene stops him here — say so rather
  // than leave a setting that visibly does nothing.
  const blockedThrough =
    only !== null && runEnd === "through" && !lastScene && !runsThrough(doc, only, activeScene);


  return (
    <div className="flex flex-col gap-3">
      {/* Who, and which scene the "This scene" tab is about. The scene chip is what
          tells the two scopes apart: everything under it changes this scene only. */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
          {player
            ? nameOf(player.id)
            : ballOnly
              ? t("inspect.ballName")
              : tn("inspect.count", selection.size)}
        </span>
        {scene && (
          <span
            title={showing === "player" ? t("inspect.tab.player.note") : t("inspect.scope.hint")}
            className="max-w-[45%] shrink-0 truncate rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-ink-300"
          >
            {showing === "player" ? t("inspect.scope.all") : scene.name}
          </span>
        )}
      </div>

      {tabs && (
        <div role="tablist" className="flex gap-1 rounded-md bg-ink-900 p-0.5">
          {(["scene", "player"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={showing === value}
              title={t(`inspect.tab.${value}.hint`)}
              onClick={() => setTab(value)}
              className={cn(
                "flex-1 rounded px-2 py-1 text-[11px] transition",
                showing === value ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-200",
              )}
            >
              {t(`inspect.tab.${value}`)}
            </button>
          ))}
        </div>
      )}

      {showing === "player" && player ? (
        <div className="flex flex-col gap-3">
          <IdentityFields
            key={player.id}
            doc={doc}
            player={player}
            nameRef={nameRef}
            onRename={onRename}
            onRenumber={onRenumber}
          />
          <p className="text-[11px] leading-relaxed text-ink-400">{t("inspect.tab.player.note")}</p>
          <div className="flex flex-col gap-1.5">
            {/* His path through every scene: about the player, not about this scene. */}
            <SmallButton
              label={t(trailOn ? "menu.trail.hide" : "menu.trail.show")}
              title={t("inspect.trail.hint")}
              icon={<Route size={13} />}
              onClick={() => onTrailChange(!trailOn)}
            />
            <SmallButton
              label={t("inspect.removeMovement")}
              title={t(hasMovement ? "inspect.removeMovement.hint" : "inspect.removeMovement.none")}
              icon={<RotateCcw size={13} />}
              disabled={!hasMovement}
              onClick={onRemoveAllMovement}
            />
            {!isKeeper && (
              <SmallButton
                label={t("inspect.makeKeeper", { who: displayName(doc, player.id) })}
                title={t("inspect.makeKeeper.hint")}
                icon={<Shirt size={13} />}
                onClick={() => onMakeKeeper(player.id)}
              />
            )}
            <SmallButton
              label={t("inspect.switchSide", { who: displayName(doc, player.id) })}
              title={t("inspect.switchSide.hint")}
              icon={<ArrowLeftRight size={13} />}
              onClick={() => onSwitchSide(player.id)}
            />
            <SmallButton
              label={t("inspect.remove", { who: displayName(doc, player.id) })}
              title={t("inspect.remove.hint")}
              icon={<UserMinus size={13} />}
              danger
              onClick={() => onRemovePlayer(player.id)}
            />
          </div>
        </div>
      ) : (
        <>
          {!player && !ballOnly && (
            <p className="text-[11px] leading-relaxed text-ink-300">
              {[...selection].map(nameOf).join(", ")}
            </p>
          )}

          {/* MOVEMENT — the run into this scene. Never hidden: where it cannot apply it
              says why, and how to get to where it does. */}
          <Group label={t("inspect.group.movement")}>
            {!canEditPaths ? (
              <Why title={t("inspect.why.firstScene")}>
                {t("inspect.why.firstScene.short")}{" "}
                {doc.scenes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onGoToScene(1)}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {t("inspect.why.firstScene.go", { scene: doc.scenes[1].name })}
                  </button>
                )}
              </Why>
            ) : null}
            {!canEditPaths && resetButton}
            {!canEditPaths ? null : ballOnly ? (
              <Why title={t("inspect.why.ball")}>{t("inspect.why.ball.short")}</Why>
            ) : doc.flow ? (
              <Why title={t("inspect.why.flow")}>{t("inspect.why.flow.short")}</Why>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={t("inspect.travelShort")}
                    title={t("inspect.travel.hint", {
                      seconds: (sceneTravelMs(scene!) / 1000).toFixed(1),
                    })}
                    value={(travel ?? scene!.transitionMs) / 1000}
                    mixed={travel === null}
                    mixedLabel={t("inspect.mixed")}
                    min={0}
                    max={60}
                    step={0.1}
                    decimals={1}
                    unit="s"
                    onCommit={(seconds) => onTravelChange(seconds * 1000)}
                    action={
                      travelOwn !== false && (
                        <ResetLink
                          label={t("inspect.matchScene")}
                          onClick={() => onTravelChange(null)}
                        />
                      )
                    }
                  />
                  <NumberField
                    label={t("inspect.delayShort")}
                    title={t("inspect.delay.hint")}
                    value={(delay ?? 0) / 1000}
                    mixed={delay === null}
                    mixedLabel={t("inspect.mixed")}
                    min={0}
                    max={60}
                    step={0.1}
                    decimals={1}
                    unit="s"
                    onCommit={(seconds) => onDelayChange(seconds * 1000)}
                    action={
                      delay !== 0 && (
                        <ResetLink label={t("inspect.delay.none")} onClick={() => onDelayChange(null)} />
                      )
                    }
                  />
                </div>

                {/* How the run starts and finishes, folded behind its summary: the
                    default is what almost every run wants, and the row says when a
                    run is not the default without spending three rows saying so. */}
                <Disclosure
                  label={t("inspect.runStyle")}
                  summary={
                    runStart === null || runEnd === null
                      ? t("inspect.mixed")
                      : runStart === "gradual" && runEnd === "gradual"
                        ? t("inspect.runStyle.default")
                        : t("inspect.runStyle.summary", {
                          start: t(`inspect.runStart.${runStart}`),
                          end: t(`inspect.runEnd.${runEnd}`),
                        })
                  }
                  highlight={runStart !== "gradual" || runEnd !== "gradual"}
                >
                  <Segmented
                    label={t("inspect.runStart")}
                    options={RUN_STARTS.map(({ value, key }) => ({
                      value,
                      label: t(key),
                      title: t(`${key}.hint` as Message["key"]),
                    }))}
                    value={runStart}
                    onChange={(start) => onRunStyleChange({ start })}
                  />
                  <Segmented
                    label={t("inspect.runEnd")}
                    options={RUN_ENDS.map(({ value, key }) => ({
                      value,
                      label: t(key),
                      title:
                        value === "through" && lastScene
                          ? t("inspect.runEnd.through.last")
                          : t(`${key}.hint` as Message["key"]),
                      disabled: value === "through" && lastScene,
                    }))}
                    value={runEnd}
                    onChange={(end) => onRunStyleChange({ end })}
                  />
                  {blockedThrough && (
                    <p className="text-[11px] leading-relaxed text-amber-300">
                      {t("inspect.runEnd.through.blocked")}
                    </p>
                  )}
                </Disclosure>

                <TimingBars doc={doc} index={activeScene} players={players} />
              </>
            )}

            {canEditPaths && resetButton}


            {canEditPaths && (
              <div className="grid grid-cols-2 gap-1.5">
                <SmallButton
                  label={t("inspect.straighten")}
                  title={t(canStraighten ? "inspect.straighten.hint" : "inspect.straighten.none")}
                  disabled={!canStraighten}
                  onClick={onClearPaths}
                />
                <SmallButton
                  label={t(runsHidden ? "inspect.showRuns.short" : "inspect.hideRuns.short")}
                  title={t(runsHidden ? "inspect.showRuns.hint" : "inspect.hideRuns.hint")}
                  onClick={() => onRunsHiddenChange(!runsHidden)}
                />
              </div>
            )}
          </Group>

          {/* BALL — who has it here. The pass itself, its timing, shot and loft, are the
              scene's and live in the scene bar under the timeline. */}
          {(only || ballOnly) && (
            <Group label={t("inspect.group.ball")}>
              {ballOnly ? (
                <Why title={t("inspect.ball.timingWhere")}>
                  {holder
                    ? t("inspect.ball.heldBy", { who: nameOf(holder) })
                    : t("inspect.ball.loose")}
                </Why>
              ) : (
                <SmallButton
                  icon={<span aria-hidden>⚽</span>}
                  label={carries ? t("inspect.ball.release") : t("inspect.ball.give", { who: nameOf(only!) })}
                  title={t("inspect.ball.hint")}
                  onClick={() => onCarrierChange(carries ? null : only)}
                />
              )}
            </Group>
          )}

          {/* HIGHLIGHT — one row: a swatch lights the selection in that colour, Off puts
              it out. Also offered on the first scene: there is no run into it, but there
              is certainly someone to watch in it. Never carried forward (D47). */}
          <Group label={t("inspect.group.highlight")}>
            <div className="flex flex-wrap items-center gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t("inspect.highlight.colour", { color: c })}
                  aria-pressed={highlighted && highlightColor === c}
                  title={t("inspect.highlight.on.hint")}
                  onClick={() => onHighlightChange(c)}
                  className={cn(
                    "size-4 rounded-full ring-1 transition",
                    highlighted && highlightColor === c
                      ? "ring-2 ring-accent ring-offset-1 ring-offset-ink-800"
                      : "ring-white/15 hover:ring-white/40",
                  )}
                  style={{ background: c }}
                />
              ))}
              <button
                type="button"
                disabled={!highlighted}
                title={t("inspect.highlight.off.hint")}
                onClick={() => onHighlightChange(null)}
                className="ml-auto rounded border border-ink-600 px-2 py-0.5 text-[11px] text-ink-300 transition enabled:hover:border-ink-400 enabled:hover:text-white disabled:opacity-40"
              >
                {t("inspect.highlight.none")}
              </button>
            </div>
          </Group>

          {/* WHEN I DRAG — read when a drag or a nudge lands, so it has to be visible
              BEFORE one, which is exactly when something is selected (D41). */}
          {doc.scenes.length > 1 && (
            <Segmented
              label={t("inspect.carry")}
              options={CARRY_MODES.map(({ mode, key }) => ({
                value: mode,
                label: t(key),
                title: t(`${key}.hint` as Message["key"]),
              }))}
              value={carry}
              onChange={onCarryChange}
            />
          )}
        </>
      )}
    </div>
  );
}

type Tab = "scene" | "player";

/** How many players' timing bars are drawn before the rest are left out. */
const TIMING_BARS_MAX = 6;

/**
 * Each selected player's run into this scene, against the scene's window: the wait,
 * the run, and an arrow where he runs on. It shows at a glance why the scene lasts
 * as long as it does — the longest bar is what it fits.
 */
function TimingBars({
  doc,
  index,
  players,
}: {
  doc: BoardDoc;
  index: number;
  players: string[];
}) {
  const { t } = useI18n();
  const scene = doc.scenes[index];
  if (!scene || players.length === 0) return null;
  const window = sceneTravelMs(scene);
  if (window <= 0) return null;
  const shown = players.slice(0, TIMING_BARS_MAX);

  return (
    <div className="flex flex-col gap-1" title={t("inspect.timing.hint")}>
      <div className="flex justify-between text-[10px] text-ink-400">
        <span>{t("inspect.timing")}</span>
        <span className="font-mono">{(window / 1000).toFixed(1)} s</span>
      </div>
      {shown.map((id) => {
        const wait = Math.min(entityDelayMs(scene, id), window);
        const run = Math.min(entityTravelMs(scene, id), window - wait);
        const through = runsThrough(doc, id, index);
        const moves = (() => {
          const a = doc.scenes[index - 1]?.positions[id];
          const b = scene.positions[id];
          return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) > 0.05;
        })();
        return (
          <div key={id} className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 truncate text-right font-mono text-[10px] text-ink-300">
              {displayName(doc, id)}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-ink-900">
              <div
                className="absolute inset-y-0 border-r border-ink-600 bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(143,163,157,0.35)_3px_5px)]"
                style={{ left: 0, width: `${(wait / window) * 100}%` }}
              />
              {moves && (
                <div
                  className={cn("absolute inset-y-0 rounded-sm", through ? "bg-emerald-400/80" : "bg-accent/80")}
                  style={{ left: `${(wait / window) * 100}%`, width: `${(run / window) * 100}%` }}
                />
              )}
            </div>
            <span className="w-3 shrink-0 text-[10px] text-emerald-300">{through ? "→" : ""}</span>
          </div>
        );
      })}
      {players.length > shown.length && (
        <span className="text-[10px] text-ink-400">
          {t("inspect.timing.more", { count: players.length - shown.length })}
        </span>
      )}
    </div>
  );
}

/** A titled block inside a tab. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </section>
  );
}

/**
 * Why a group has nothing to offer here, in place of the controls: one short line,
 * with the whole explanation on hover — a paragraph for every disabled group made
 * the panel taller than the controls it was standing in for.
 */
function Why({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-ink-400" title={title}>
      <Info size={12} className="shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function ResetLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="normal-case tracking-normal text-ink-300 underline-offset-2 hover:text-white hover:underline"
    >
      {label}
    </button>
  );
}

/**
 * A folded group that still says what is inside it. The summary is accented when
 * the contents are not the default, so a changed setting is visible while folded.
 */
function Disclosure({
  label,
  summary,
  highlight,
  children,
}: {
  label: string;
  summary: string;
  highlight: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded border border-ink-600 px-2 py-1.5 text-left text-[11px] transition hover:border-ink-400"
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 text-ink-400 transition-transform", open && "rotate-90")}
        />
        <span className="text-ink-300">{label}</span>
        <span className={cn("ml-auto truncate", highlight ? "text-accent" : "text-ink-400")}>
          {summary}
        </span>
      </button>
      {open && <div className="flex flex-col gap-2.5 pl-1">{children}</div>}
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

  /** The next shirt along that nobody else on the team wears, or null at the end. */
  const nextFree = (direction: 1 | -1): number | null => {
    for (let n = player.number + direction; n >= 0 && n <= 99; n += direction) {
      if (!shirtClash(doc, player.id, n)) return n;
    }
    return null;
  };
  const step = (direction: 1 | -1) => {
    const n = nextFree(direction);
    if (n === null) return;
    setDraft(null);
    onRenumber(player.id, n);
  };

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
        <label className="flex w-16 shrink-0 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("inspect.number")}</span>
          <span
            className={cn(
              "flex items-stretch overflow-hidden rounded border bg-ink-900 transition",
              clash
                ? "border-red-500/70 focus-within:border-red-400"
                : "border-ink-600 hover:border-ink-400 focus-within:border-accent",
            )}
          >
            <input
              type="text"
              inputMode="numeric"
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
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                step(e.key === "ArrowUp" ? 1 : -1);
              }}
              onBlur={() => setDraft(null)}
              className={cn(
                "w-full min-w-0 bg-ink-900 px-2 py-1 font-mono text-xs outline-none",
                clash ? "text-red-300" : "text-ink-200",
              )}
            />
            <Stepper
              className="border-l border-ink-600"
              upLabel={t("field.increase", { label: t("inspect.number") })}
              downLabel={t("field.decrease", { label: t("inspect.number") })}
              upDisabled={nextFree(1) === null}
              downDisabled={nextFree(-1) === null}
              onUp={() => step(1)}
              onDown={() => step(-1)}
            />
          </span>
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
  danger,
  onClick,
}: {
  label: string;
  /** Sits before the label. Decorative — the label already says what it does. */
  icon?: React.ReactNode;
  title?: string;
  disabled?: boolean;
  /** Takes something away; turns red on hover rather than accent. */
  danger?: boolean;
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
        !disabled && (danger ? "hover:border-red-500/60 hover:text-red-400" : "hover:border-accent hover:text-white"),
      )}
    >
      {icon}
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

/** A labelled row of mutually exclusive choices, none pressed when `value` is null. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; title: string; disabled?: boolean }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded border px-1 py-1.5 text-[11px] transition disabled:opacity-40",
              value === option.value
                ? "border-accent text-accent"
                : "border-ink-600 text-ink-400 enabled:hover:text-ink-200",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
