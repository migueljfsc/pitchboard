import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Pencil, Presentation, Repeat, X } from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { DEFAULT_PITCH_VIEW } from "@/board/types";
import { BoardCanvas } from "@/components/BoardCanvas";
import { ExportDialog } from "@/components/ExportDialog";
import { SpeedButton } from "@/components/Timeline";
import { useExportJob } from "@/lib/useExportJob";
import { ViewControls } from "@/components/ViewControls";
import { sceneStartSeconds, totalSeconds } from "@/board/scenes";
import { frameAt } from "@/board/timeline";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { countUsage } from "@/share/usage";
import { SceneNoteStrip } from "@/components/SceneNote";
import { CoffeeLink } from "@/components/CoffeeLink";
import { LogoMark } from "@/components/Logo";
import { BAR_BUTTON, BAR_DIVIDER, BAR_PRIMARY } from "@/components/ui/bar";
import { PlayButton } from "@/components/ui/PlayButton";
import { HOME_PATH } from "@/share/routes";
import { spring } from "@/lib/motion";

type Props = {
  doc: BoardDoc;
  /** How the sharer was framing the board. The crop is theirs and cannot be
   *  changed here; rotation and 3D are the viewer's own (D35). */
  initialView?: PitchView;
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
export function Viewer({ doc, initialView, onFork }: Props) {
  const { t, tn } = useI18n();
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [pitchView, setPitchView] = useState<PitchView>(initialView ?? DEFAULT_PITCH_VIEW);
  const [speed, setSpeed] = useState(1);
  // Presenting hides everything but the board and a thin bar, and asks for the whole
  // screen — a coach showing the move to a room.
  const [present, setPresent] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // What a recipient can take away without forking: the same exports the editor makes.
  const exportJob = useExportJob();

  const total = totalSeconds(doc);
  const frame = frameAt(doc, time);

  // Playback clock. Held in a ref so a re-render mid-play does not restart it.
  const raf = useRef<number>(0);
  const last = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();

    const tick = (now: number) => {
      const delta = ((now - last.current) / 1000) * speed;
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
  }, [playing, loop, total, speed]);

  const sceneIndex = frame.resolved.index;
  const goToScene = useCallback(
    (index: number) => {
      if (index < 0 || index >= doc.scenes.length) return;
      setPlaying(false);
      setTime(sceneStartSeconds(doc, index));
    },
    [doc],
  );

  const presentOn = (on: boolean) => {
    setPresent(on);
    if (on) countUsage("present");
    // Fullscreen is a request the browser may refuse; presenting works in the window too.
    if (on) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  // Leaving fullscreen with the browser's own Esc ends presenting too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Space plays, the arrows step scenes, Esc stops presenting. The export dialog owns the
  // keyboard while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exportOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        goToScene(sceneIndex + (e.key === "ArrowRight" ? 1 : -1));
      } else if (e.key === "Escape" && present) {
        setPresent(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen, goToScene, sceneIndex, present]);

  return (
    <div className="flex h-full w-full flex-col bg-ink-900">
      {!present && (
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-800 px-4 py-2">
        <a href={HOME_PATH} title={t("app.name")} className="shrink-0 rounded-lg">
          <LogoMark />
        </a>
        <span className={BAR_DIVIDER} />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-white">{doc.name}</h1>
          <p className="truncate text-[11px] text-ink-400">
            {t("viewer.shared")} · {doc.teams[0].name} v {doc.teams[1].name} ·{" "}
            {tn("viewer.scenes", doc.scenes.length)}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ViewControls view={pitchView} onChange={setPitchView} showHalves={false} />
          <span className={BAR_DIVIDER} />
          <button
            type="button"
            onClick={() => presentOn(true)}
            title={t("present.enter.title")}
            className={BAR_BUTTON}
          >
            <Presentation size={13} />
            {t("present.enter")}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            title={t("viewer.download.title")}
            className={BAR_BUTTON}
          >
            <Download size={13} />
            {t("viewer.download")}
          </button>
          {/* The one thing a recipient is invited to do: take the board and make it theirs. */}
          <button type="button" onClick={onFork} className={BAR_PRIMARY}>
            <Pencil size={13} />
            {t("viewer.fork")}
          </button>
          <span className={BAR_DIVIDER} />
          <LocaleSwitch />
          <span className={BAR_DIVIDER} />
          <CoffeeLink />
        </div>
      </header>
      )}

      <div className="min-h-0 flex-1">
        <BoardCanvas
          doc={doc}
          t={time}
          sceneIndex={sceneIndex}
          pitchView={pitchView}
          interactive={false}
          sceneCamera
          selection={EMPTY}
          onSelectionChange={noop}
          onDocChange={noop}
        />
      </div>

      <SceneNoteStrip doc={doc} index={sceneIndex} />

      <div className="flex shrink-0 items-center gap-3 border-t border-ink-700 bg-ink-800 px-4 py-3">
        <PlayButton
          playing={playing}
          onToggle={() => setPlaying(!playing)}
          label={t(playing ? "viewer.pause" : "viewer.play")}
        />

        <button
          type="button"
          onClick={() => setLoop(!loop)}
          aria-label={t("viewer.loop")}
          aria-pressed={loop}
          title={t(loop ? "viewer.loop.off" : "viewer.loop.on")}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border transition",
            loop ? "border-accent text-accent" : "border-ink-600 text-ink-400 hover:text-ink-200",
          )}
        >
          <Repeat size={14} />
        </button>

        <SpeedButton speed={speed} onChange={setSpeed} />

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
          aria-label={t("viewer.scrub")}
          className="scrubber min-w-0 flex-1"
          style={{ "--fill": `${total > 0 ? (Math.min(time, total) / total) * 100 : 0}%` } as React.CSSProperties}
        />

        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-400">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>

        {present && (
          <button
            type="button"
            onClick={() => presentOn(false)}
            title={t("present.exit.title")}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-ink-400 hover:text-white"
          >
            <X size={13} />
            {t("present.exit")}
          </button>
        )}
      </div>

      {!present && doc.scenes.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-ink-700 bg-ink-800 px-4 pb-3">
          {doc.scenes.map((scene, i) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => goToScene(i)}
              aria-current={sceneIndex === i ? "true" : undefined}
              className={cn(
                "relative isolate shrink-0 rounded-lg px-3 py-1.5 text-left text-xs transition",
                sceneIndex === i ? "text-ink-900" : "text-ink-300 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {/* One highlight, sliding from scene to scene as the play moves through them. */}
              {sceneIndex === i && (
                <motion.span
                  layoutId="viewer-scene"
                  aria-hidden
                  transition={spring}
                  className="absolute inset-0 -z-10 rounded-lg bg-accent"
                />
              )}
              <span className="mr-1.5 font-mono text-[10px] opacity-60">{i + 1}</span>
              {scene.name}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {exportOpen && (
          <ExportDialog
            doc={doc}
            t={time}
            pitchView={pitchView}
            onClose={() => setExportOpen(false)}
            exportJob={exportJob}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const EMPTY: ReadonlySet<string> = new Set();
const noop = () => {};
