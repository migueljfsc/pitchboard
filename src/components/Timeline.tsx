import { useEffect, useRef } from "react";
import {
  Pause,
  Play,
  Plus,
  Copy,
  Crosshair,
  Waves,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Repeat,
} from "lucide-react";
import type { BoardDoc } from "@/board/types";
import {
  addSceneAfter,
  ballTravels,
  deleteScene,
  duplicateScene,
  moveScene,
  renameScene,
  setSceneTiming,
  setShot,
  totalSeconds,
} from "@/board/scenes";
import {
  DEFAULT_END_HOLD_MS,
  DEFAULT_FLOW_SPEED,
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  resolveAt,
  sceneTimings,
} from "@/board/timeline";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
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
};

export function Timeline({
  doc,
  onDocChange,
  activeScene,
  onActiveSceneChange,
  time,
  onTimeChange,
  playing,
  onPlayingChange,
  loop,
  onLoopChange,
}: Props) {
  const total = totalSeconds(doc);
  const scene = doc.scenes[activeScene];

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

  const canShoot = ballTravels(doc, activeScene);
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
      {/* Transport */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-ink-900 transition hover:brightness-110"
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={() => onLoopChange(!loop)}
          aria-label="Loop"
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
          aria-label="Seamless flow"
          aria-pressed={!!flow}
          title={
            flow
              ? "Back to per-scene travel and hold times"
              : "One continuous movement: no holds between scenes, one pace throughout"
          }
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            flow ? "border-accent text-accent" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Waves size={14} />
        </button>

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
          className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          aria-label="Scrub timeline"
        />

        <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-400">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>
      </div>

      {/* Scene strip */}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {doc.scenes.map((s, i) => {
          const isLive = i === live.index;
          // Filling while travelling in, full once the scene is held.
          const progress = !isLive ? 0 : live.moving ? live.u * 100 : 100;

          return (
            <button
              key={s.id}
              ref={isLive ? liveRef : undefined}
              type="button"
              onClick={() => onActiveSceneChange(i)}
              aria-current={isLive ? "true" : undefined}
              className={cn(
                "flex min-w-28 shrink-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition",
                i === activeScene
                  ? "border-accent bg-ink-700"
                  : "border-ink-600 hover:border-ink-400",
                // The playhead is its own signal, so a scene can be selected,
                // playing, or both without the two states blurring together.
                isLive && i !== activeScene && "border-accent/50 bg-accent/5",
              )}
            >
              <span className={cn("text-xs font-medium", isLive ? "text-white" : "text-ink-200")}>
                {s.name}
              </span>
              <span className="font-mono text-[11px] text-ink-400">
                {i > 0 ? `${(timing[i].travelMs / 1000).toFixed(1)}s` : ""}
                {timing[i].holdMs > 0 && `${i > 0 ? " → " : ""}${(timing[i].holdMs / 1000).toFixed(1)}s`}
                {s.shot && <span className="ml-1 text-accent">shot</span>}
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
          onClick={() => mutate(addSceneAfter(doc, activeScene), activeScene + 1)}
          aria-label="Add scene"
          className="flex w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-ink-600 text-ink-400 transition hover:border-accent hover:text-accent"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Active scene controls */}
      {scene && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Scene</span>
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
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-ink-400">Pace</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={MIN_FLOW_SPEED}
                    max={MAX_FLOW_SPEED}
                    step={0.5}
                    value={flow.speed}
                    onChange={(e) => {
                      const speed = Number(e.target.value);
                      if (speed >= MIN_FLOW_SPEED && speed <= MAX_FLOW_SPEED) {
                        setFlow({ ...flow, speed }, "flow-speed");
                      }
                    }}
                    className="w-16 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-xs text-ink-200 outline-none focus:border-accent"
                  />
                  <span className="text-[11px] text-ink-400">m/s</span>
                </div>
              </label>
              <Duration
                label="End hold"
                value={flow.endHoldMs}
                onChange={(v) => setFlow({ ...flow, endHoldMs: Math.round(v) }, "flow-hold")}
              />
              <p className="max-w-64 text-[11px] leading-relaxed text-ink-300">
                One pace for every scene, nothing held in between. Each scene takes as long as
                its longest run needs.
              </p>
            </>
          ) : (
            <>
              {activeScene > 0 && (
                <Duration
                  label="Travel"
                  value={scene.transitionMs}
                  onChange={(v) => onDocChange(setSceneTiming(doc, activeScene, { transitionMs: v }))}
                />
              )}
              <Duration
                label="Hold"
                value={scene.holdMs}
                onChange={(v) => onDocChange(setSceneTiming(doc, activeScene, { holdMs: v }))}
              />
            </>
          )}

          {activeScene > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-ink-400">Ball</span>
              <button
                type="button"
                disabled={!canShoot}
                aria-pressed={scene.shot ?? false}
                onClick={() => onDocChange(setShot(doc, activeScene, !scene.shot))}
                title={
                  canShoot
                    ? "Draw the ball's travel into this scene as a strike rather than a pass"
                    : "The ball does not travel into this scene — release it or pass it first"
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition disabled:opacity-45",
                  scene.shot
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-300 enabled:hover:border-ink-400 enabled:hover:text-white",
                )}
              >
                <Crosshair size={13} />
                Shot
              </button>
            </label>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <IconButton
              label="Move scene earlier"
              disabled={activeScene === 0}
              onClick={() => mutate(moveScene(doc, activeScene, activeScene - 1), activeScene - 1)}
            >
              <ChevronLeft size={14} />
            </IconButton>
            <IconButton
              label="Move scene later"
              disabled={activeScene === doc.scenes.length - 1}
              onClick={() => mutate(moveScene(doc, activeScene, activeScene + 1), activeScene + 1)}
            >
              <ChevronRight size={14} />
            </IconButton>
            <IconButton
              label="Duplicate scene"
              onClick={() => mutate(duplicateScene(doc, activeScene), activeScene + 1)}
            >
              <Copy size={14} />
            </IconButton>
            <IconButton
              label="Delete scene"
              disabled={doc.scenes.length <= 1}
              onClick={() => mutate(deleteScene(doc, activeScene), Math.max(0, activeScene - 1))}
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
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={60}
          step={0.1}
          value={(value / 1000).toFixed(1)}
          onChange={(e) => onChange(Number(e.target.value) * 1000)}
          className="w-16 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-xs text-ink-200 outline-none focus:border-accent"
        />
        <span className="text-[11px] text-ink-400">s</span>
      </div>
    </label>
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
