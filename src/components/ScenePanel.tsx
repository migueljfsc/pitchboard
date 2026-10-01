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
 * The scene being worked on, in the Selection card while nothing is selected: with no player,
 * ball or link picked, the scene is what an edit lands on. Its name and note, its timing, its
 * spotlight and the ball's part in the travel into it, and moving, copying or deleting it.
 */
export function ScenePanel({
  doc,
  activeScene,
  onDocChange,
  onActiveSceneChange,
  onDeleteScene,
}: {
  doc: BoardDoc;
  activeScene: number;
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-ink-700 font-mono text-[11px] text-ink-200">
          {activeScene + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{scene.name}</span>
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

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-400">{t("timeline.scene")}</span>
        <input
          value={scene.name}
          onChange={(e) => onDocChange(renameScene(doc, activeScene, e.target.value), `scene-name:${scene.id}`)}
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-ink-200 outline-none focus:border-accent"
        />
      </label>

      {/* What the coach wants said about this scene: shown under the board in the viewer
          and while presenting, and in an export's caption when asked for. */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-400">{t("timeline.note")}</span>
        <textarea
          value={scene.note ?? ""}
          rows={2}
          maxLength={MAX_NOTE_CHARS}
          placeholder={t("timeline.note.placeholder")}
          onChange={(e) => onDocChange(setSceneNote(doc, activeScene, e.target.value), `scene-note:${scene.id}`)}
          className="field-sizing-content max-h-32 min-h-[44px] w-full resize-none rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs leading-snug text-ink-200 outline-none placeholder:text-ink-500 focus:border-accent"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
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

        {/* Only where there is something to spotlight: the darkness is drawn around
            this scene's highlights and nowhere else. */}
        {Object.keys(scene.highlight ?? {}).length > 0 && (
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
        )}
      </div>

      {/* The ball's own part of the travel into this scene. */}
      {activeScene > 0 && (
        <div className="flex flex-col gap-3 border-t border-ink-700 pt-4">
          <span className="text-xs text-ink-400">{t("timeline.ball")}</span>
          <div className="grid grid-cols-2 gap-1.5">
            <BallToggle
              on={scene.shot ?? false}
              disabled={!canShoot}
              title={canShoot ? t("timeline.shot.can") : t("timeline.shot.cannot")}
              onClick={() => onDocChange(setShot(doc, activeScene, !scene.shot))}
            >
              <Crosshair size={13} />
              {t("timeline.shot")}
            </BallToggle>
            <BallToggle
              on={scene.loft ?? false}
              disabled={!canLoft}
              title={canLoft ? t("timeline.loft.can") : t("timeline.loft.cannot")}
              onClick={() => onDocChange(setLoft(doc, activeScene, !scene.loft))}
            >
              <Spline size={13} />
              {t("timeline.loft.label")}
            </BallToggle>
          </div>
          <PassTiming doc={doc} index={activeScene} onDocChange={onDocChange} />
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-500">{t("scene.panel.hint")}</p>
    </div>
  );
}

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
        "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition disabled:opacity-45",
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
    <div className="flex flex-col gap-2" title={reason ?? undefined}>
      <div className="grid grid-cols-2 gap-3">
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
      </div>
      {readout && <span className="font-mono text-[11px] text-ink-400">{readout}</span>}
      {reason && <span className="text-[11px] leading-relaxed text-ink-500">{reason}</span>}
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
