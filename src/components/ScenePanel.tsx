import { ChevronLeft, ChevronRight, Copy, Crosshair, Spline, Trash2 } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { BALL_ID } from "@/board/types";
import { NumberField } from "@/components/ui/NumberField";
import {
  ballTravelBetween,
  canLoft as canLoftInto,
  canShoot as canShootInto,
  DEFAULT_SPOTLIGHT,
  duplicateScene,
  MAX_NOTE_CHARS,
  MAX_SPOTLIGHT,
  moveScene,
  renameScene,
  setDelay,
  setLoft,
  setSceneNote,
  setScenePace,
  setSceneTiming,
  setShot,
  setSpotlight,
  setTravel,
} from "@/board/scenes";
import {
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  entityDelayMs,
  entityTravelMs,
  passEnds,
  transitionInto,
  scenePace,
} from "@/board/timeline";
import { toMetres } from "@/board/sports";
import { useI18n } from "@/i18n/context";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";

/**
 * The selected scene's name and note, stacked beside the scene track and previews, so the scene in
 * view sits next to what it is called. The note is a fixed box that scrolls rather than grows, or a
 * long one pushes the previews aside. Folded previews leave no room, and `ScenePanel` takes them back.
 */
export function SceneIdentity({
  doc,
  activeScene,
  onDocChange,
}: {
  doc: BoardDoc;
  activeScene: number;
  onDocChange: Change<BoardDoc>;
}) {
  const { t } = useI18n();
  const scene = doc.scenes[activeScene];
  if (!scene) return null;
  return (
    <div className="row-span-2 flex min-w-0 flex-col gap-2 self-stretch">
      <SceneName doc={doc} activeScene={activeScene} onDocChange={onDocChange} className="w-full" />
      <label className="flex min-h-0 flex-1 flex-col gap-1">
        <span className="text-xs text-ink-400">{t("timeline.note")}</span>
        <SceneNote
          doc={doc}
          activeScene={activeScene}
          onDocChange={onDocChange}
          rows={3}
          className="min-h-16 w-full flex-1 overflow-y-auto"
        />
      </label>
    </div>
  );
}

function SceneName({
  doc,
  activeScene,
  onDocChange,
  className,
}: {
  doc: BoardDoc;
  activeScene: number;
  onDocChange: Change<BoardDoc>;
  className: string;
}) {
  const { t } = useI18n();
  const scene = doc.scenes[activeScene];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-400">{t("timeline.scene")}</span>
      <input
        value={scene.name}
        onChange={(e) => onDocChange(renameScene(doc, activeScene, e.target.value), `scene-name:${scene.id}`)}
        className={cn(
          "rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-200 outline-none focus:border-accent",
          className,
        )}
      />
    </label>
  );
}

/**
 * What the coach wants said about this scene: shown under the board in the viewer and while
 * presenting, and in an export's caption when asked for.
 */
function SceneNote({
  doc,
  activeScene,
  onDocChange,
  rows,
  className,
}: {
  doc: BoardDoc;
  activeScene: number;
  onDocChange: Change<BoardDoc>;
  rows: number;
  className: string;
}) {
  const { t } = useI18n();
  const scene = doc.scenes[activeScene];
  return (
    <textarea
      value={scene.note ?? ""}
      rows={rows}
      maxLength={MAX_NOTE_CHARS}
      placeholder={t("timeline.note.placeholder")}
      aria-label={t("timeline.note")}
      onChange={(e) => onDocChange(setSceneNote(doc, activeScene, e.target.value), `scene-note:${scene.id}`)}
      className={cn(
        "resize-none rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs leading-snug text-ink-200 outline-none placeholder:text-ink-500 focus:border-accent",
        className,
      )}
    />
  );
}

/**
 * The selected scene's own fields, as one row at the bottom: its timing, its spotlight and the
 * ball's part in the travel into it, and moving, copying or deleting it — and its name and note
 * too while `SceneIdentity` is not shown. Always in reach, whatever is selected on the board.
 */
export function ScenePanel({
  doc,
  activeScene,
  withIdentity,
  onDocChange,
  onActiveSceneChange,
  onDeleteScene,
}: {
  doc: BoardDoc;
  activeScene: number;
  withIdentity: boolean;
  onDocChange: Change<BoardDoc>;
  onActiveSceneChange: (index: number, doc?: BoardDoc) => void;
  onDeleteScene: (index: number) => void;
}) {
  const { t } = useI18n();
  const scene = doc.scenes[activeScene];
  if (!scene) return null;
  const flow = doc.flow;
  const canShoot = canShootInto(doc, activeScene);
  const canLoft = canLoftInto(doc, activeScene);

  const mutate = (next: BoardDoc, index: number) => {
    onDocChange(next);
    onActiveSceneChange(Math.max(0, Math.min(index, next.scenes.length - 1)), next);
  };

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      {withIdentity && (
        <>
          <SceneName doc={doc} activeScene={activeScene} onDocChange={onDocChange} className="w-32" />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">{t("timeline.note")}</span>
            <SceneNote
              doc={doc}
              activeScene={activeScene}
              onDocChange={onDocChange}
              rows={1}
              className="field-sizing-content max-h-24 min-h-[26px] w-56"
            />
          </label>
        </>
      )}

      <div className={cn(GROUP, !withIdentity && "border-l-0 pl-0")}>
        {flow ? (
          <>
            {activeScene > 0 && (
              <NumberField
                key={scene.id}
                label={t("timeline.pace")}
                title={t("timeline.pace.title")}
                value={scenePace(doc, activeScene)}
                min={MIN_FLOW_SPEED}
                max={MAX_FLOW_SPEED}
                step={0.5}
                unit="m/s"
                onCommit={(v) => onDocChange(setScenePace(doc, activeScene, v), `pace:${scene.id}`)}
              />
            )}
            <Duration
              label={t("timeline.endHold")}
              value={flow.endHoldMs}
              onChange={(v) => onDocChange({ ...doc, flow: { ...flow, endHoldMs: Math.round(v) } }, "flow-hold")}
            />
          </>
        ) : (
          <>
            {activeScene > 0 && (
              <Duration
                label={t("timeline.travel")}
                value={scene.transitionMs}
                onChange={(v) => onDocChange(setSceneTiming(doc, activeScene, { transitionMs: v }))}
              />
            )}
            <Duration
              label={t("timeline.hold")}
              value={scene.holdMs}
              onChange={(v) => onDocChange(setSceneTiming(doc, activeScene, { holdMs: v }))}
            />
          </>
        )}
      </div>

      {/* Only where there is something to spotlight: the darkness is drawn around
          this scene's highlights and nowhere else. */}
      {Object.keys(scene.highlight ?? {}).length > 0 && (
        <div className={GROUP}>
          <NumberField
            key={`spotlight:${scene.id}`}
            label={t("timeline.spotlight")}
            title={t("timeline.spotlight.title")}
            value={Math.round((scene.spotlight ?? DEFAULT_SPOTLIGHT) * 100)}
            min={0}
            max={MAX_SPOTLIGHT * 100}
            step={5}
            unit="%"
            onCommit={(v) => onDocChange(setSpotlight(doc, activeScene, v / 100), `spotlight:${scene.id}`)}
          />
        </div>
      )}

      {/* The ball's own part of the travel into this scene. */}
      {activeScene > 0 && (
        <div className={GROUP}>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">{t("timeline.ball")}</span>
            <BallToggle
              on={scene.shot ?? false}
              disabled={!canShoot}
              title={canShoot ? t("timeline.shot.can") : t("timeline.shot.cannot")}
              onClick={() => onDocChange(setShot(doc, activeScene, !scene.shot))}
            >
              <Crosshair size={13} />
              {t("timeline.shot")}
            </BallToggle>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">{t("timeline.loft")}</span>
            <BallToggle
              on={scene.loft ?? false}
              disabled={!canLoft}
              title={canLoft ? t("timeline.loft.can") : t("timeline.loft.cannot")}
              onClick={() => onDocChange(setLoft(doc, activeScene, !scene.loft))}
            >
              <Spline size={13} />
              {t("timeline.loft.label")}
            </BallToggle>
          </label>
          <PassTiming doc={doc} index={activeScene} onDocChange={onDocChange} />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <IconButton
          label={t("timeline.moveEarlier")}
          disabled={activeScene === 0}
          onClick={() => mutate(moveScene(doc, activeScene, activeScene - 1), activeScene - 1)}
        >
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton
          label={t("timeline.moveLater")}
          disabled={activeScene === doc.scenes.length - 1}
          onClick={() => mutate(moveScene(doc, activeScene, activeScene + 1), activeScene + 1)}
        >
          <ChevronRight size={14} />
        </IconButton>
        <IconButton
          label={t("timeline.duplicate")}
          onClick={() =>
            mutate(duplicateScene(doc, activeScene, t("doc.sceneCopy", { name: scene.name })), activeScene + 1)
          }
        >
          <Copy size={14} />
        </IconButton>
        <IconButton
          label={t("timeline.deleteScene")}
          danger
          disabled={doc.scenes.length <= 1}
          onClick={() => onDeleteScene(activeScene)}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * One logical group of the scene bar — its timing, its spotlight, its ball — set off from the
 * one before by a rule, so a row of a dozen fields reads as four things.
 */
const GROUP = "flex items-end gap-3 border-l-2 border-ink-600 pl-3";

function BallToggle({
  on,
  disabled,
  title,
  onClick,
  children,
}: {
  on: boolean;
  disabled: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition disabled:opacity-45",
        on
          ? "border-accent/70 bg-accent/15 text-white"
          : "border-ink-600 text-ink-300 enabled:hover:border-ink-400 enabled:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Duration({ label, value, onChange }: { label: string; value: number; onChange: (ms: number) => void }) {
  return (
    <NumberField
      label={label}
      value={value / 1000}
      min={0}
      max={60}
      step={0.1}
      decimals={1}
      unit="s"
      onCommit={(v) => onChange(v * 1000)}
    />
  );
}

/**
 * When the ball is struck and how long it travels, for the pass INTO this scene.
 *
 * With the scene rather than in a selected ball's card because it describes the scene's pass,
 * like Shot and Loft beside it, and needs no ball selected to find. Always shown from the
 * second scene on, and greyed with the reason where there is no pass to time — a carried ball
 * goes where its carrier goes (D97).
 */
function PassTiming({ doc, index, onDocChange }: { doc: BoardDoc; index: number; onDocChange: Change<BoardDoc> }) {
  const { t } = useI18n();
  const scene = doc.scenes[index];
  const played = ballTravelBetween(doc, doc.scenes[index - 1], scene) !== "none";
  const reason = doc.flow ? t("timeline.pass.flow") : !played ? t("timeline.pass.carried") : null;
  const disabled = reason !== null;

  const takesMs = entityTravelMs(scene, BALL_ID);
  const releaseMs = entityDelayMs(scene, BALL_ID);
  const own = scene.travel?.[BALL_ID] !== undefined;

  // How far the pass goes and how hard, so "tension" is a number and not a feel.
  const r = transitionInto(doc, index);
  const ends = !disabled && r ? passEnds(r, doc) : null;
  const metres = ends ? toMetres(doc, Math.hypot(ends.end.x - ends.start.x, ends.end.y - ends.start.y)) : 0;
  const readout =
    ends && metres >= 0.5 && takesMs > 0
      ? t("timeline.pass.speed", {
          metres: Math.round(metres),
          seconds: (takesMs / 1000).toFixed(1),
          speed: Math.round(metres / (takesMs / 1000)),
        })
      : null;

  return (
    <div className="flex items-end gap-2" title={reason ?? undefined}>
      <NumberField
        key={`release:${scene.id}`}
        label={t("timeline.pass.release")}
        title={reason ?? t("timeline.pass.release.hint")}
        value={releaseMs / 1000}
        min={0}
        max={60}
        step={0.1}
        decimals={1}
        unit="s"
        disabled={disabled}
        onCommit={(v) => onDocChange(setDelay(doc, index, BALL_ID, v * 1000), `pass-release:${scene.id}`)}
      />
      <NumberField
        key={`takes:${scene.id}`}
        label={t("timeline.pass.takes")}
        title={reason ?? t("timeline.pass.takes.hint")}
        value={takesMs / 1000}
        min={0.1}
        max={60}
        step={0.1}
        decimals={1}
        unit="s"
        disabled={disabled}
        onCommit={(v) => onDocChange(setTravel(doc, index, BALL_ID, v * 1000), `pass-takes:${scene.id}`)}
        action={
          own &&
          !disabled && (
            <button
              type="button"
              onClick={() => onDocChange(setTravel(doc, index, BALL_ID, null))}
              className="text-ink-300 underline-offset-2 hover:text-white hover:underline"
            >
              {t("timeline.pass.matchScene")}
            </button>
          )
        }
      />
      {readout && <span className="pb-1.5 font-mono text-[11px] text-ink-400">{readout}</span>}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Destroys something: red on hover, as the menus' destructive items are. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-ink-600 text-ink-400 transition disabled:opacity-45",
        danger
          ? "enabled:hover:border-red-500/70 enabled:hover:bg-red-500/10 enabled:hover:text-red-400"
          : "enabled:hover:border-accent enabled:hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}
