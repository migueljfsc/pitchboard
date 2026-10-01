import { useEffect, useRef, useState } from "react";
import { Plus, Waves, Gauge, Images, Info, Repeat } from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { SceneThumb, THUMB_WIDTH } from "@/components/SceneThumb";
import { SceneIdentity, ScenePanel } from "@/components/ScenePanel";
import { loadScenePreviews, saveScenePreviews } from "@/share/scenePreviews";
import { addSceneAfter, ballTravelBetween, moveScene, setSceneTiming, totalSeconds } from "@/board/scenes";
import { DEFAULT_END_HOLD_MS, DEFAULT_FLOW_SPEED, resolveAt, runsThrough, sceneTimings } from "@/board/timeline";
import { useI18n } from "@/i18n/context";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";
import { PlayButton } from "@/components/ui/PlayButton";

type Props = {
  doc: BoardDoc;
  /** Framing the previews are drawn through, so a preview matches the board above it. */
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
  /** Playback speed, 1 for real time. Editor-only; an export always renders at 1×. */
  speed: number;
  onSpeedChange: (speed: number) => void;
  /** Deleting a scene goes through the editor, which can offer to undo it. */
  onDeleteScene: (index: number) => void;
};

/**
 * Playback above, the scenes below it as one track: a block per scene, as long as the scene
 * lasts, laid under the scrubber so a block's edge sits under the thumb at that moment; unless
 * folded away, a preview of each scene under that; and the selected scene's own fields last.
 */
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
  speed,
  onSpeedChange,
  onDeleteScene,
}: Props) {
  const { t } = useI18n();
  const total = totalSeconds(doc);
  // A preference about this window, kept by the browser: not a view of the board, not the document.
  const [thumbs, setThumbsState] = useState(loadScenePreviews);
  const setThumbs = (shown: boolean) => {
    setThumbsState(shown);
    saveScenePreviews(shown);
  };
  const flow = doc.flow;

  const addScene = () => {
    const next = addSceneAfter(doc, activeScene, t("doc.scene", { n: doc.scenes.length + 1 }));
    onDocChange(next);
    onActiveSceneChange(activeScene + 1, next);
  };

  return (
    <div
      data-tour="timeline"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 border-t border-ink-700 bg-ink-800 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <PlayButton
          playing={playing}
          onToggle={() => onPlayingChange(!playing)}
          label={t(playing ? "viewer.pause" : "viewer.play")}
        />

        <button
          type="button"
          onClick={() => onLoopChange(!loop)}
          aria-label={t("viewer.loop")}
          aria-pressed={loop}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            loop ? "border-accent/70 bg-accent/15 text-white" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Repeat size={14} />
        </button>

        <SpeedButton speed={speed} onChange={onSpeedChange} />

        {/* Flow sets the per-scene timings aside rather than overwriting them,
            so turning it off gives back whatever was tuned. */}
        <button
          type="button"
          onClick={() => onDocChange(flow ? withoutFlow(doc) : withFlow(doc))}
          aria-label={t("timeline.flow")}
          aria-pressed={!!flow}
          title={flow ? t("timeline.flow.off") : t("timeline.flow.on")}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            flow ? "border-accent/70 bg-accent/15 text-white" : "border-ink-600 text-ink-400 hover:text-ink-200",
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
            thumbs ? "border-accent/70 bg-accent/15 text-white" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Images size={14} />
        </button>
      </div>

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
        className="scrubber block w-full"
        style={{ "--fill": `${total > 0 ? (Math.min(time, total) / total) * 100 : 0}%` } as React.CSSProperties}
        aria-label={t("timeline.scrub")}
      />

      <div className="flex items-center gap-1">
        <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-400">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>
        <span
          className="flex shrink-0 cursor-help text-ink-400 transition hover:text-ink-200"
          title={t("timeline.track.legend.hint")}
          aria-label={t("timeline.track.legend.hint")}
        >
          <Info size={13} />
        </span>
      </div>

      {/* With the previews shown, the scene's name and note fill the column beside the track
          and the previews; folded, that cell is empty and they join the row below. */}
      {thumbs ? <SceneIdentity doc={doc} activeScene={activeScene} onDocChange={onDocChange} /> : <span aria-hidden />}

      <SceneTrack
        doc={doc}
        time={time}
        playing={playing}
        activeScene={activeScene}
        onActiveSceneChange={onActiveSceneChange}
        onDocChange={onDocChange}
      />

      {/* The way to add a scene follows the scenes: after the previews when they are shown,
          beside the track when they are folded away. */}
      {thumbs ? <span aria-hidden /> : <AddScene className="h-7 justify-self-start" onAdd={addScene} />}

      {thumbs && (
        <>
          <ScenePreviews
            doc={doc}
            view={view}
            activeScene={activeScene}
            live={playing ? resolveAt(doc, time).index : -1}
            onActiveSceneChange={onActiveSceneChange}
            onAdd={addScene}
          />
          <span aria-hidden />
        </>
      )}

      <div className="col-span-3 border-t border-ink-700 pt-2.5">
        <ScenePanel
          doc={doc}
          activeScene={activeScene}
          withIdentity={!thumbs}
          onDocChange={onDocChange}
          onActiveSceneChange={onActiveSceneChange}
          onDeleteScene={onDeleteScene}
        />
      </div>
    </div>
  );
}

/**
 * Each scene as it looks, in order, under the track: a strip of fixed-size previews, since a
 * block sized by time is too narrow to show a short scene. Click one to go to it.
 */
function ScenePreviews({
  doc,
  view,
  activeScene,
  live,
  onActiveSceneChange,
  onAdd,
}: {
  doc: BoardDoc;
  view: PitchView;
  activeScene: number;
  live: number;
  onActiveSceneChange: (index: number) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const activeRef = useRef<HTMLButtonElement>(null);
  // A scene chosen on the track or from the keyboard can be off the end of the strip.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeScene, live]);

  return (
    <div className="flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:thin]">
      {doc.scenes.map((s, i) => {
        const active = i === activeScene;
        return (
          <button
            key={s.id}
            ref={active ? activeRef : undefined}
            type="button"
            onClick={() => onActiveSceneChange(i)}
            aria-label={t("timeline.tick", { n: i + 1, name: s.name })}
            aria-current={active ? "true" : undefined}
            style={{ width: THUMB_WIDTH + 12 }}
            className={cn(
              "flex shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition",
              active ? "border-accent bg-ink-700" : "border-ink-600 hover:border-ink-400",
              live === i && !active && "border-accent/60",
            )}
          >
            <span className="relative block overflow-hidden rounded">
              <SceneThumb doc={doc} index={i} view={view} />
              <span
                className={cn(
                  "absolute left-1 top-1 min-w-4 rounded px-1 text-center font-mono text-[10px] leading-4",
                  active ? "bg-accent text-ink-900" : "bg-ink-900/80 text-ink-200",
                )}
              >
                {i + 1}
              </span>
            </span>
            <span className={cn("truncate px-0.5 text-[11px]", active ? "text-white" : "text-ink-300")}>{s.name}</span>
          </button>
        );
      })}
      <AddScene className="self-stretch" onAdd={onAdd} />
    </div>
  );
}

/** A dashed slot after the last scene: adds one after the selected scene. */
function AddScene({ className, onAdd }: { className?: string; onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={t("timeline.addScene")}
      title={t("timeline.addScene")}
      className={cn(
        "flex w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-ink-600 text-ink-400 transition hover:border-accent hover:text-accent",
        className,
      )}
    >
      <Plus size={15} />
    </button>
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

/** Narrower than this, a block shows its number only; narrower still, nothing. Wider than
 *  `TIMES_MIN_PX`, its times and marks follow the name. */
const LABEL_MIN_PX = 64;
const NUMBER_MIN_PX = 16;
const TIMES_MIN_PX = 150;

/**
 * The whole clip as blocks: each scene's travel, striped, then its hold, solid — widths in
 * proportion to time, so the rhythm of the move is visible at once. Click a block to go to
 * its scene, drag it onto another to reorder. Outside flow mode the right edge of each part
 * can be dragged to change that time; flow derives its own.
 *
 * Laid across the track the scrubber's thumb actually travels — the full width less the
 * thumb — so a block's edge sits under the thumb at that moment.
 */
function SceneTrack({
  doc,
  time,
  playing,
  activeScene,
  onActiveSceneChange,
  onDocChange,
}: {
  doc: BoardDoc;
  time: number;
  playing: boolean;
  activeScene: number;
  onActiveSceneChange: (index: number, doc?: BoardDoc) => void;
  onDocChange: Change<BoardDoc>;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const drag = useRef<{ index: number; field: "transitionMs" | "holdMs"; x: number; from: number; msPerPx: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const timing = sceneTimings(doc);
  // A board with no time in it still shows its scenes, side by side.
  const lengths = timing.map((s, i) => (i === 0 ? 0 : s.travelMs) + s.holdMs);
  const real = lengths.reduce((n, ms) => n + ms, 0);
  const shares = real > 0 ? lengths : lengths.map(() => 1000);
  const total = shares.reduce((n, ms) => n + ms, 0);
  const live = playing ? resolveAt(doc, time).index : -1;

  const at = (ms: number) => `calc(${SCRUB_THUMB / 2}px + (100% - ${SCRUB_THUMB}px) * ${ms / total})`;
  const span = (ms: number) => `calc((100% - ${SCRUB_THUMB}px) * ${ms / total})`;
  const px = (ms: number) => Math.max(width - SCRUB_THUMB, 0) * (ms / total);

  const startDrag = (e: React.PointerEvent, index: number, field: "transitionMs" | "holdMs") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      index,
      field,
      x: e.clientX,
      from: doc.scenes[index][field],
      msPerPx: total / Math.max(width - SCRUB_THUMB, 1),
    };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const scene = doc.scenes[d.index];
    const ms =
      Math.round(
        Math.min(Math.max(d.from + (e.clientX - d.x) * d.msPerPx, d.field === "transitionMs" ? 100 : 0), 60_000) / 50,
      ) * 50;
    if (ms !== scene[d.field]) {
      onDocChange(setSceneTiming(doc, d.index, { [d.field]: ms }), `track:${scene.id}:${d.field}`);
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const starts = shares.map((_, i) => shares.slice(0, i).reduce((n, ms) => n + ms, 0));
  return (
    <div ref={ref} className="relative h-7">
      {doc.scenes.map((s, i) => {
        const travel = i === 0 ? 0 : timing[i].travelMs;
        const hold = timing[i].holdMs;
        const length = shares[i];
        const active = i === activeScene;
        const wide = px(length);
        const label = t("timeline.tick", { n: i + 1, name: s.name });
        const pass = i > 0 && !s.shot && ballTravelBetween(doc, doc.scenes[i - 1], s) === "pass";
        const through = Object.keys(s.run ?? {}).some((id) => runsThrough(doc, id, i));
        return (
          <div
            key={s.id}
            className="absolute inset-y-0"
            style={{ left: at(starts[i]), width: span(length) }}
          >
            <button
              type="button"
              onClick={() => onActiveSceneChange(i)}
              title={t("timeline.track.block", {
                name: label,
                travel: (travel / 1000).toFixed(1),
                hold: (hold / 1000).toFixed(1),
              })}
              aria-label={label}
              aria-current={active ? "true" : undefined}
              // Drag a block onto another to move the scene there; the Selection card's arrows
              // do the same a step at a time.
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
                if (dragging !== null && dragging !== i) {
                  const next = moveScene(doc, dragging, i);
                  onDocChange(next);
                  onActiveSceneChange(i, next);
                }
                setDragging(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              className={cn(
                "absolute inset-y-0 left-px right-px flex overflow-hidden rounded transition",
                active ? "ring-1 ring-inset ring-accent/80" : "hover:ring-1 hover:ring-inset hover:ring-ink-400",
                live === i && !active && "ring-1 ring-inset ring-accent/40",
                dragging === i && "opacity-40",
                // Where the dragged scene lands: before this one when coming from the right,
                // after it when coming from the left.
                dropAt === i &&
                  dragging !== null &&
                  dragging !== i &&
                  (dragging > i
                    ? "shadow-[inset_3px_0_0_0_var(--color-accent)]"
                    : "shadow-[inset_-3px_0_0_0_var(--color-accent)]"),
              )}
            >
              {/* Moving: striped, so it reads as travel rather than as a paler hold. */}
              {travel > 0 && (
                <span
                  className="h-full"
                  style={{
                    width: `${(travel / Math.max(travel + hold, 1)) * 100}%`,
                    background: active
                      ? "repeating-linear-gradient(135deg, rgba(238,241,234,0.28) 0 3px, rgba(238,241,234,0.12) 3px 6px)"
                      : "repeating-linear-gradient(135deg, rgba(152,176,160,0.2) 0 3px, rgba(152,176,160,0.07) 3px 6px)",
                  }}
                />
              )}
              <span className={cn("h-full flex-1", active ? "bg-accent/20" : "bg-ink-700/80")} />

              {wide >= NUMBER_MIN_PX && (
                <span className="pointer-events-none absolute inset-0 flex min-w-0 items-center gap-1.5 px-2 text-[11px] leading-none">
                  <span className={cn("font-mono text-[10px]", active ? "text-white" : "text-ink-400")}>{i + 1}</span>
                  {wide >= LABEL_MIN_PX && (
                    <span className={cn("min-w-0 truncate font-medium", active ? "text-white" : "text-ink-200")}>
                      {s.name}
                    </span>
                  )}
                  {wide >= TIMES_MIN_PX && (
                    <span className="min-w-0 shrink-[3] truncate font-mono text-[10px] text-ink-400">
                      {i > 0 ? `${(timing[i].travelMs / 1000).toFixed(1)}s` : ""}
                      {timing[i].holdMs > 0 && `${i > 0 ? " → " : ""}${(timing[i].holdMs / 1000).toFixed(1)}s`}
                      {s.shot && <span className="ml-1 text-accent">{t("timeline.shotMark")}</span>}
                      {s.loft && <span className="ml-1 text-accent">{t("timeline.loftMark")}</span>}
                      {pass && <span className="ml-1 text-sky-300">{t("timeline.passMark")}</span>}
                      {through && (
                        <span className="ml-1 text-emerald-300" title={t("timeline.throughMark.hint")}>
                          {t("timeline.throughMark")}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              )}
            </button>

            {!doc.flow && real > 0 && i > 0 && (
              <span
                role="separator"
                title={t("timeline.track.travel")}
                onPointerDown={(e) => startDrag(e, i, "transitionMs")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                className="absolute inset-y-1 z-10 w-1.5 -translate-x-1/2 cursor-ew-resize rounded-full hover:bg-white/60"
                style={{ left: `${(travel / Math.max(travel + hold, 1)) * 100}%` }}
              />
            )}
            {!doc.flow && real > 0 && (
              <span
                role="separator"
                title={t("timeline.track.hold")}
                onPointerDown={(e) => startDrag(e, i, "holdMs")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                className="absolute inset-y-1 right-0 z-10 w-1.5 translate-x-1/2 cursor-ew-resize rounded-full hover:bg-white/60"
              />
            )}

          </div>
        );
      })}
    </div>
  );
}

/** The speeds playback cycles through. */
const SPEEDS = [1, 2, 0.5] as const;

/**
 * How fast playback runs, cycled by clicking: 1×, 2×, ½×. For walking a team
 * through a move slowly. Editor-only — an export always renders in real time.
 */
export function SpeedButton({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (speed: number) => void;
}) {
  const { t } = useI18n();
  const at = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
  const next = SPEEDS[(at + 1) % SPEEDS.length];
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={t("timeline.speed", { speed: speed === 0.5 ? "½" : String(speed) })}
      title={t("timeline.speed.hint")}
      className={cn(
        "flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border px-2 font-mono text-[11px] transition",
        speed === 1 ? "border-ink-600 text-ink-400 hover:text-ink-200" : "border-accent/70 bg-accent/15 text-white",
      )}
    >
      <Gauge size={13} />
      {speed === 0.5 ? "½×" : `${speed}×`}
    </button>
  );
}

/** Diameter of the scrubber's thumb, in CSS pixels — set by `.scrubber` in index.css. */
const SCRUB_THUMB = 16;
