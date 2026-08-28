import { Pause, Play, Plus, Copy, Trash2, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import {
  addSceneAfter,
  deleteScene,
  duplicateScene,
  moveScene,
  renameScene,
  setSceneTiming,
  totalSeconds,
} from "@/board/scenes";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  onDocChange: (next: BoardDoc) => void;
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
        {doc.scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onActiveSceneChange(i)}
            className={cn(
              "flex min-w-28 shrink-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition",
              i === activeScene
                ? "border-accent bg-ink-700"
                : "border-ink-600 hover:border-ink-400",
            )}
          >
            <span className="text-xs font-medium text-ink-200">{s.name}</span>
            <span className="font-mono text-[11px] text-ink-400">
              {i > 0 ? `${(s.transitionMs / 1000).toFixed(1)}s → ` : ""}
              {(s.holdMs / 1000).toFixed(1)}s
            </span>
          </button>
        ))}

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
              onChange={(e) => onDocChange(renameScene(doc, activeScene, e.target.value))}
              className="w-32 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-200 outline-none focus:border-accent"
            />
          </label>

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
