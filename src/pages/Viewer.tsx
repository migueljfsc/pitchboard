import { useEffect, useRef, useState } from "react";
import { Pause, Pencil, Play, Repeat } from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { DEFAULT_PITCH_VIEW } from "@/board/types";
import { BoardCanvas } from "@/components/BoardCanvas";
import { ViewControls } from "@/components/ViewControls";
import { sceneStartSeconds, totalSeconds } from "@/board/scenes";
import { frameAt } from "@/board/timeline";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  /** Take a local copy and open it in the editor. */
  onFork: () => void;
};

/**
 * A shared board, read-only.
 *
 * D7 makes a published snapshot immutable, and this is what makes that legible:
 * you are shown a tactic rather than handed an editor that happens to contain
 * one. Nothing here can change the document — the canvas takes no pointer
 * events and draws with the same `interactive: false` the exporter uses, so what
 * a recipient sees is exactly what an exported frame would show.
 *
 * Forking is the only way out, and it is a local copy: the link still holds the
 * original, so there is nothing to overwrite and no permission to grant.
 */
export function Viewer({ doc, onFork }: Props) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [pitchView, setPitchView] = useState<PitchView>(DEFAULT_PITCH_VIEW);

  const total = totalSeconds(doc);
  const frame = frameAt(doc, time);

  // Playback clock. Held in a ref so a re-render mid-play does not restart it.
  const raf = useRef<number>(0);
  const last = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();

    const tick = (now: number) => {
      const delta = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const next = t + delta;
        if (next < total) return next;
        if (loop) return next % Math.max(total, 0.001);
        setPlaying(false);
        return total;
      });
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, loop, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code !== "Space") return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-ink-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-800 px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-white">{doc.name}</h1>
          <p className="text-[11px] text-ink-400">
            Shared board · {doc.teams[0].name} v {doc.teams[1].name} ·{" "}
            {doc.scenes.length === 1 ? "1 scene" : `${doc.scenes.length} scenes`}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ViewControls view={pitchView} onChange={setPitchView} />
          <button
            type="button"
            onClick={onFork}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110"
          >
            <Pencil size={13} />
            Fork to edit
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <BoardCanvas
          doc={doc}
          t={time}
          sceneIndex={frame.resolved.index}
          pitchView={pitchView}
          interactive={false}
          selection={EMPTY}
          onSelectionChange={noop}
          onDocChange={noop}
        />
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-ink-700 bg-ink-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-ink-900 transition hover:brightness-110"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <button
          type="button"
          onClick={() => setLoop(!loop)}
          aria-label="Loop"
          aria-pressed={loop}
          title={loop ? "Stop at the end" : "Loop"}
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
            setPlaying(false);
            setTime(Number(e.target.value));
          }}
          aria-label="Scrub"
          className="min-w-0 flex-1 accent-accent"
        />

        <span className="shrink-0 font-mono text-[11px] text-ink-400">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>
      </div>

      {doc.scenes.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-ink-700 bg-ink-800 px-4 pb-3">
          {doc.scenes.map((scene, i) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => {
                setPlaying(false);
                setTime(sceneStartSeconds(doc, i));
              }}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-left text-xs transition",
                frame.resolved.index === i
                  ? "border-accent text-white"
                  : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
              )}
            >
              {scene.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY: ReadonlySet<string> = new Set();
const noop = () => {};
