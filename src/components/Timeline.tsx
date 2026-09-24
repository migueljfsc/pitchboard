import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  Copy,
  Crosshair,
  Spline,
  Waves,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Images,
  Repeat,
} from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { SceneThumb, THUMB_WIDTH } from "@/components/SceneThumb";
import { NumberField } from "@/components/ui/NumberField";
import {
  addSceneAfter,
  canLoft as canLoftInto,
  canShoot as canShootInto,
  duplicateScene,
  moveScene,
  renameScene,
  sceneStartSeconds,
  setSceneTiming,
  setLoft,
  setShot,
  totalSeconds,
  setScenePace,
} from "@/board/scenes";
import {
  DEFAULT_END_HOLD_MS,
  DEFAULT_FLOW_SPEED,
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  resolveAt,
  sceneTimings,
  scenePace,
} from "@/board/timeline";
import { useI18n } from "@/i18n/context";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  /** Framing the strip previews through, so a tile matches the board above it. */
  view: PitchView;
  onDocChange: Change<BoardDoc>;
  activeScene: number;
  /** `doc` is passed when the change accompanies an edit, because the caller's
   *  own state has not updated yet and timings must be read from the new list. */
  onActiveSceneChange: (index: number, doc?: BoardDoc) => void;
  time: number;
  onTimeChange: (seconds: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  /** Deleting a scene goes through the editor, which can offer to undo it. */
  onDeleteScene: (index: number) => void;
};

export function Timeline({
  doc,
  view,
  onDocChange,
  activeScene,
  onActiveSceneChange,
  time,
  onTimeChange,
  playing,
  onPlayingChange,
  loop,
  onLoopChange,
  onDeleteScene,
}: Props) {
  const { t } = useI18n();
  const total = totalSeconds(doc);
  const scene = doc.scenes[activeScene];
  // Strip presentation, so it stays here: it is not a view of the board and not
  // part of the document.
  const [thumbs, setThumbs] = useState(true);

  // Where the playhead actually is, which parts company with the selected scene
  // the moment playback starts — starting play drops the selection back to
  // scene 1 so no editing overlay hangs over the animation.
  const live = resolveAt(doc, time);
  const liveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Only while playing: yanking the strip around under someone scrubbing by
    // hand would fight them for it.
    if (playing) liveRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [live.index, playing]);

  // A scene chosen from the keyboard or the scrubber's ticks can be off the end of
  // the strip; bring it into view. Choosing one never happens mid-scrub.
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!playing) activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeScene, playing]);

  // Which ends of the strip have more scenes past them, so the edge can say so.
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });
  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const before = el.scrollLeft > 1;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setOverflow((o) => (o.before === before && o.after === after ? o : { before, after }));
  }, []);
  useEffect(() => {
    measure();
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, doc.scenes.length, thumbs]);
  const scrollStrip = (direction: 1 | -1) =>
    stripRef.current?.scrollBy({ left: direction * stripRef.current.clientWidth * 0.8, behavior: "smooth" });

  // Scene being dragged to a new place in the strip, and where it would land.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const canShoot = canShootInto(doc, activeScene);
  const canLoft = canLoftInto(doc, activeScene);
  // What each scene is really worth, which is not its own fields in flow mode.
  const timing = sceneTimings(doc);
  const flow = doc.flow;

  const setFlow = (next: BoardDoc["flow"], merge?: string) =>
    onDocChange({ ...doc, ...(next ? { flow: next } : {}) }, merge);

  const mutate = (next: BoardDoc, index = activeScene) => {
    onDocChange(next);
    onActiveSceneChange(Math.max(0, Math.min(index, next.scenes.length - 1)), next);
  };

  return (
    <div className="flex flex-col gap-3 border-t border-ink-700 bg-ink-800 px-4 py-3">
      {/* Transport. Bottom margin makes room for the scene ticks under the scrubber. */}
      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={t(playing ? "viewer.pause" : "viewer.play")}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-ink-900 transition hover:brightness-110"
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={() => onLoopChange(!loop)}
          aria-label={t("viewer.loop")}
          aria-pressed={loop}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            loop ? "border-accent text-accent" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Repeat size={14} />
        </button>

        {/* Flow sets the per-scene timings aside rather than overwriting them,
            so turning it off gives back whatever was tuned. */}
        <button
          type="button"
          onClick={() => onDocChange(flow ? withoutFlow(doc) : withFlow(doc))}
          aria-label={t("timeline.flow")}
          aria-pressed={!!flow}
          title={
            flow
              ? t("timeline.flow.off")
              : t("timeline.flow.on")
          }
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            flow ? "border-accent text-accent" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Waves size={14} />
        </button>

        <button
          type="button"
          onClick={() => setThumbs(!thumbs)}
          aria-label={t("timeline.thumbs")}
          aria-pressed={thumbs}
          title={thumbs ? t("timeline.thumbs.off") : t("timeline.thumbs.on")}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            thumbs ? "border-accent text-accent" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Images size={14} />
        </button>

        {/* The ticks sit where each scene comes to rest, measured across the track
            the thumb actually travels — the full width less the thumb itself. */}
        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(total, 0.001)}
            step={0.01}
            value={Math.min(time, total)}
            onChange={(e) => {
              onPlayingChange(false);
              onTimeChange(Number(e.target.value));
            }}
            className="block h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            aria-label={t("timeline.scrub")}
          />
          {total > 0 && (
            <div className="absolute inset-x-0 top-full mt-1.5 h-2.5">
              {doc.scenes.map((s, i) => {
                const at = Math.min(1, sceneStartSeconds(doc, i) / total);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onActiveSceneChange(i)}
                    title={t("timeline.tick", { n: i + 1, name: s.name })}
                    aria-label={t("timeline.tick", { n: i + 1, name: s.name })}
                    style={{ left: `calc(${SCRUB_THUMB / 2}px + (100% - ${SCRUB_THUMB}px) * ${at})` }}
                    className="group absolute top-0 flex h-2.5 w-3 -translate-x-1/2 justify-center"
                  >
                    <span
                      className={cn(
                        "block h-full w-0.5 rounded-full transition",
                        i === activeScene
                          ? "bg-accent"
                          : "bg-ink-400/60 group-hover:bg-ink-200",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-400">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>
      </div>

      {/* Scene strip. The edges fade and offer a scroll where there are more scenes
          past them — a row that simply stops at the panel edge read as the end. */}
      <div className="relative">
      <div
        ref={stripRef}
        onScroll={measure}
        className="flex items-stretch gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {doc.scenes.map((s, i) => {
          const isLive = i === live.index;
          // Filling while travelling in, full once the scene is held.
          const progress = !isLive ? 0 : live.moving ? live.u * 100 : 100;

          return (
            <button
              key={s.id}
              ref={(el) => {
                if (isLive) liveRef.current = el;
                if (i === activeScene) activeRef.current = el;
              }}
              type="button"
              onClick={() => onActiveSceneChange(i)}
              aria-current={isLive ? "true" : undefined}
              // Drag a scene to reorder the strip. The chevrons below do the same a
              // step at a time; this is for moving one a long way.
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropAt !== i) setDropAt(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== i) mutate(moveScene(doc, dragging, i), i);
                setDragging(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              style={thumbs ? { width: THUMB_WIDTH + 20 } : undefined}
              className={cn(
                "relative flex min-w-28 shrink-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition",
                i === activeScene
                  ? "border-accent bg-ink-700"
                  : "border-ink-600 hover:border-ink-400",
                // The playhead is its own signal, so a scene can be selected,
                // playing, or both without the two states blurring together.
                isLive && i !== activeScene && "border-accent/50 bg-accent/5",
                dragging === i && "opacity-40",
                // Where the dragged scene lands: before this one when coming from
                // the right, after it when coming from the left.
                dropAt === i &&
                  dragging !== null &&
                  dragging !== i &&
                  (dragging > i
                    ? "shadow-[inset_3px_0_0_0_var(--color-accent)]"
                    : "shadow-[inset_-3px_0_0_0_var(--color-accent)]"),
              )}
            >
              {thumbs && (
                <span className="relative block">
                  <SceneThumb doc={doc} index={i} view={view} />
                  <span
                    className={cn(
                      "absolute left-1 top-1 min-w-4 rounded px-1 text-center font-mono text-[10px] leading-4",
                      i === activeScene ? "bg-accent text-ink-900" : "bg-ink-900/80 text-ink-200",
                    )}
                  >
                    {i + 1}
                  </span>
                </span>
              )}
              <span
                className={cn(
                  "max-w-full truncate text-xs font-medium",
                  isLive ? "text-white" : "text-ink-200",
                )}
              >
                {s.name}
              </span>
              <span className="font-mono text-[11px] text-ink-400">
                {i > 0 ? `${(timing[i].travelMs / 1000).toFixed(1)}s` : ""}
                {timing[i].holdMs > 0 && `${i > 0 ? " → " : ""}${(timing[i].holdMs / 1000).toFixed(1)}s`}
                {s.shot && <span className="ml-1 text-accent">{t("timeline.shotMark")}</span>}
                {s.loft && <span className="ml-1 text-accent">{t("timeline.loftMark")}</span>}
              </span>
              <span className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-ink-600/70">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${progress}%` }}
                />
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => mutate(addSceneAfter(doc, activeScene, t("doc.scene", { n: doc.scenes.length + 1 })), activeScene + 1)}
          aria-label={t("timeline.addScene")}
          className="flex w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-ink-600 text-ink-400 transition hover:border-accent hover:text-accent"
        >
          <Plus size={15} />
        </button>
      </div>
      {overflow.before && (
        <StripEdge side="before" label={t("timeline.scrollEarlier")} onClick={() => scrollStrip(-1)} />
      )}
      {overflow.after && (
        <StripEdge side="after" label={t("timeline.scrollLater")} onClick={() => scrollStrip(1)} />
      )}
      </div>

      {/* Active scene controls */}
      {scene && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("timeline.scene")}</span>
            <input
              value={scene.name}
              onChange={(e) =>
                onDocChange(renameScene(doc, activeScene, e.target.value), `scene-name:${scene.id}`)
              }
              className="w-32 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-200 outline-none focus:border-accent"
            />
          </label>

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
                  onCommit={(v) =>
                    onDocChange(setScenePace(doc, activeScene, v), `pace:${scene.id}`)
                  }
                />
              )}
              <Duration
                label={t("timeline.endHold")}
                value={flow.endHoldMs}
                onChange={(v) => setFlow({ ...flow, endHoldMs: Math.round(v) }, "flow-hold")}
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

          {activeScene > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("timeline.ball")}</span>
              <button
                type="button"
                disabled={!canShoot}
                aria-pressed={scene.shot ?? false}
                onClick={() => onDocChange(setShot(doc, activeScene, !scene.shot))}
                title={
                  canShoot ? t("timeline.shot.can") : t("timeline.shot.cannot")
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition disabled:opacity-45",
                  scene.shot
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-300 enabled:hover:border-ink-400 enabled:hover:text-white",
                )}
              >
                <Crosshair size={13} />
                {t("timeline.shot")}
              </button>
            </label>
          )}

          {activeScene > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-ink-400">
                {t("timeline.loft")}
              </span>
              <button
                type="button"
                disabled={!canLoft}
                aria-pressed={scene.loft ?? false}
                onClick={() => onDocChange(setLoft(doc, activeScene, !scene.loft))}
                title={canLoft ? t("timeline.loft.can") : t("timeline.loft.cannot")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition disabled:opacity-45",
                  scene.loft
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-300 enabled:hover:border-ink-400 enabled:hover:text-white",
                )}
              >
                <Spline size={13} />
                {t("timeline.loft.label")}
              </button>
            </label>
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
              onClick={() => mutate(
                  duplicateScene(doc, activeScene, t("doc.sceneCopy", { name: scene.name })),
                  activeScene + 1,
                )}
            >
              <Copy size={14} />
            </IconButton>
            <IconButton
              label={t("timeline.deleteScene")}
              disabled={doc.scenes.length <= 1}
              onClick={() => onDeleteScene(activeScene)}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dropped rather than set undefined, so the board serialises as it did before. */
function withoutFlow(doc: BoardDoc): BoardDoc {
  const next = { ...doc };
  delete next.flow;
  return next;
}

const withFlow = (doc: BoardDoc): BoardDoc => ({
  ...doc,
  flow: { speed: DEFAULT_FLOW_SPEED, endHoldMs: DEFAULT_END_HOLD_MS },
});

function Duration({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (ms: number) => void;
}) {
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

/** Diameter of the scrubber's thumb, in CSS pixels — the browser default. */
const SCRUB_THUMB = 16;

/** A fade over one end of the scene strip, with a button that scrolls it. */
function StripEdge({
  side,
  label,
  onClick,
}: {
  side: "before" | "after";
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 flex w-14 items-center",
        side === "before"
          ? "left-0 justify-start bg-gradient-to-r from-ink-800 to-transparent"
          : "right-0 justify-end bg-gradient-to-l from-ink-800 to-transparent",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="pointer-events-auto flex size-7 items-center justify-center rounded-full border border-ink-600 bg-ink-900/90 text-ink-200 shadow transition hover:border-accent hover:text-accent"
      >
        {side === "before" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 items-center justify-center rounded-md border border-ink-600 text-ink-400 transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-45"
    >
      {children}
    </button>
  );
}
