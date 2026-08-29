import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, ImageIcon, Loader2, X } from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { totalSeconds } from "@/board/scenes";
import { runExport, type ExportHandle } from "@/export/client";
import { encodableFormats } from "@/export/capability";
import { renderPng } from "@/export/image";
import {
  DEFAULT_GIF_RESOLUTION,
  DEFAULT_RESOLUTION,
  MAX_GIF_RESOLUTION,
  RESOLUTIONS,
  exportSize,
  frameCount,
} from "@/export/frame";
import {
  BITRATES,
  DEFAULT_BITRATE,
  DEFAULT_FPS,
  FPS_OPTIONS,
  type ExportFormat,
  type ExportPhase,
  type VideoFormat,
} from "@/export/types";
import { cn, slug } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  /** The frame a PNG exports — whatever the scrubber is on. */
  t: number;
  /** The framing on screen. The export matches it rather than reframing. */
  pitchView: PitchView;
  onClose: () => void;
};

type Job = { phase: ExportPhase; fraction: number };

const LABEL: Record<ExportFormat, string> = {
  mp4: "MP4",
  webm: "WebM",
  gif: "GIF",
  png: "PNG",
};

const BLURB: Record<ExportFormat, string> = {
  mp4: "H.264. Plays everywhere — QuickTime, VLC, a browser, a phone.",
  webm: "VP9. Smaller than MP4 at the same quality; not every player takes it.",
  gif: "Loops on its own and pastes into a chat. One palette, so no shimmer.",
  png: "The frame the scrubber is on, at full resolution.",
};

const PHASE: Record<ExportPhase, string> = {
  palette: "Building the palette",
  render: "Rendering",
  finalise: "Writing the file",
};

/**
 * MP4, WebM, GIF or PNG, all rendered by the same drawBoard the editor uses.
 *
 * The clip formats go to a worker and render offline — faster than realtime,
 * dropping nothing, and leaving the UI alive. A PNG is one frame and stays here.
 */
export function ExportDialog({ doc, t, pitchView, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("mp4");
  // A GIF wants a different size from a video, and one clamped list would mean
  // picking GIF then MP4 again silently exported at GIF's size. Two, so each
  // format keeps the size it was given.
  const [videoEdge, setVideoEdge] = useState<number>(DEFAULT_RESOLUTION);
  const [gifEdge, setGifEdge] = useState<number>(DEFAULT_GIF_RESOLUTION);
  const [fps, setFps] = useState(DEFAULT_FPS.mp4);
  const [bitrate, setBitrate] = useState<number>(DEFAULT_BITRATE);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** The last capability answer, tagged with what it was an answer about. */
  const [probe, setProbe] = useState<{ key: string; formats: VideoFormat[] } | null>(null);

  const handle = useRef<ExportHandle | null>(null);
  /** The last file produced, kept so "Download again" needs no re-encode. */
  const file = useRef<{ data: Blob; name: string } | null>(null);

  const longEdge = format === "gif" ? gifEdge : videoEdge;
  const setLongEdge = format === "gif" ? setGifEdge : setVideoEdge;

  const duration = totalSeconds(doc);
  const size = useMemo(() => exportSize(longEdge, doc, pitchView), [longEdge, doc, pitchView]);
  const { width, height } = size;
  const frames = format === "png" ? 1 : frameCount(duration, fps);

  // Sizes a format can sensibly take. A GIF is a frame of pixels per frame, so
  // the big ones are a trap rather than an option.
  const sizes = useMemo(
    () => RESOLUTIONS.filter((r) => format !== "gif" || r <= MAX_GIF_RESOLUTION),
    [format],
  );

  const stop = useCallback(() => {
    handle.current?.cancel();
    handle.current = null;
  }, []);

  // Terminate on unmount as well as on cancel: closing the dialog mid-export
  // must not leave a worker encoding into nothing.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Which containers this browser can encode, at the size and bitrate about to
  // be used — the answer changes with resolution, so it is re-asked when they do.
  // Tagging the answer rather than clearing it on the way in keeps the effect
  // free of a synchronous setState: a result for a size you have since changed
  // is simply not the answer to the question being asked.
  const probeKey = `${width}x${height}@${bitrate}`;
  const encodable = probe?.key === probeKey ? probe.formats : null;

  useEffect(() => {
    let live = true;
    const key = `${width}x${height}@${bitrate}`;
    void encodableFormats({ width, height }, bitrate)
      .then((formats) => live && setProbe({ key, formats }))
      .catch(() => live && setProbe({ key, formats: [] }));
    return () => {
      live = false;
    };
  }, [width, height, bitrate]);

  const unavailable =
    (format === "mp4" || format === "webm") && encodable !== null && !encodable.includes(format);

  /**
   * Any change to what would be produced invalidates the last result.
   *
   * The saved line names a file and its size. Left standing beside settings it
   * was not produced from, it reads as a prediction of what those settings will
   * produce — a 900 KB GIF is not what 2560 at 60 fps is about to cost. The
   * blob goes with it, since a stale one is a video's worth of memory held for
   * a button that is no longer offered.
   */
  const forget = () => {
    setSaved(null);
    setError(null);
    file.current = null;
  };

  const chooseFormat = (next: ExportFormat) => {
    forget();
    setFormat(next);
    if (next !== "png") setFps(DEFAULT_FPS[next]);
  };

  const save = (data: Blob, extension: string) => {
    file.current = { data, name: `${slug(doc.name)}.${extension}` };
    download(file.current);
    setSaved(`${file.current.name} — ${megabytes(data.size)}`);
  };

  const start = () => {
    setError(null);
    setSaved(null);

    if (format === "png") {
      setJob({ phase: "render", fraction: 0 });
      void renderPng(doc, t, pitchView, longEdge)
        .then((png) => save(png, "png"))
        .catch((err: unknown) => setError(message(err)))
        .finally(() => setJob(null));
      return;
    }

    setJob({ phase: "render", fraction: 0 });
    handle.current = runExport(
      { doc, pitchView, format, size, fps, bitrate },
      {
        onProgress: (phase, fraction) => setJob({ phase, fraction }),
        onDone: (result) => {
          handle.current = null;
          setJob(null);
          save(new Blob([result.buffer], { type: result.mime }), result.extension);
        },
        onError: (msg) => {
          handle.current = null;
          setJob(null);
          setError(msg);
        },
      },
    );
  };

  const cancel = () => {
    stop();
    setJob(null);
  };

  const close = () => {
    stop();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="export-title" className="text-sm font-semibold text-white">
            Export
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="ml-auto flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <Field label="Format">
            <div className="flex flex-wrap gap-1">
              {(["mp4", "webm", "gif", "png"] as const).map((f) => (
                <Choice key={f} active={format === f} onClick={() => chooseFormat(f)}>
                  {LABEL[f]}
                </Choice>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">{BLURB[format]}</p>
            {unavailable && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300">
                This browser cannot encode {LABEL[format]} at {size.width}×{size.height}
                {encodable && encodable.length > 0
                  ? ` — try ${LABEL[encodable[0]]}, a smaller size, or a GIF.`
                  : " — try a smaller size, or a GIF."}
              </p>
            )}
          </Field>

          <Field label={format === "png" ? "Size" : "Resolution"}>
            <div className="flex flex-wrap gap-1">
              {sizes.map((r) => (
                <Choice
                  key={r}
                  active={longEdge === r}
                  onClick={() => {
                    forget();
                    setLongEdge(r);
                  }}
                >
                  {r}
                </Choice>
              ))}
            </div>
          </Field>

          {format !== "png" && (
            <Field label="Frame rate">
              <div className="flex flex-wrap gap-1">
                {FPS_OPTIONS[format].map((r) => (
                  <Choice
                    key={r}
                    active={fps === r}
                    onClick={() => {
                      forget();
                      setFps(r);
                    }}
                  >
                    {r} fps
                  </Choice>
                ))}
              </div>
            </Field>
          )}

          {(format === "mp4" || format === "webm") && (
            <Field label="Bitrate">
              <div className="flex flex-wrap gap-1">
                {BITRATES.map((r) => (
                  <Choice
                    key={r}
                    active={bitrate === r}
                    onClick={() => {
                      forget();
                      setBitrate(r);
                    }}
                  >
                    {r / 1e6} Mb/s
                  </Choice>
                ))}
              </div>
            </Field>
          )}

          {/* What is actually about to be produced. The dimensions come from the
              same exportSize the worker uses, so this is a statement rather than
              an estimate. */}
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded border border-ink-700 bg-ink-900 px-3 py-2.5 font-mono text-[11px]">
            <Stat label="Size">
              {size.width}×{size.height}
            </Stat>
            <Stat label={format === "png" ? "Frame" : "Frames"}>
              {format === "png" ? `${t.toFixed(2)}s` : frames}
            </Stat>
            <Stat label="Length">{format === "png" ? "—" : `${duration.toFixed(1)}s`}</Stat>
          </dl>

          {error && (
            <p
              role="alert"
              className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-red-300"
            >
              {error}
            </p>
          )}

          {saved && !job && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-[11px] text-ink-300">
              <span className="font-mono">{saved}</span>
              <button
                type="button"
                onClick={() => file.current && download(file.current)}
                className="ml-auto text-accent transition hover:brightness-110"
              >
                Download again
              </button>
            </div>
          )}

          {job ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] text-ink-300">
                <Loader2 size={13} className="animate-spin text-accent" />
                <span>{PHASE[job.phase]}</span>
                {format !== "png" && (
                  <span className="ml-auto font-mono">{Math.round(job.fraction * 100)}%</span>
                )}
              </div>
              {format !== "png" && (
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-150"
                    style={{ width: `${Math.max(2, job.fraction * 100)}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={cancel}
                disabled={format === "png"}
                className="self-end rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 transition enabled:hover:border-ink-400 enabled:hover:text-white disabled:opacity-45"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={unavailable}
              className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-ink-900 transition enabled:hover:brightness-110 disabled:opacity-45"
            >
              {format === "png" ? <ImageIcon size={13} /> : <Film size={13} />}
              Export {LABEL[format]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function download({ data, name }: { data: Blob; name: string }) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revoking immediately can beat the download in Safari; a tick is enough.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const megabytes = (bytes: number) =>
  bytes < 1e6 ? `${Math.round(bytes / 1e3)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-ink-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-ink-200">{children}</dd>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 basis-16 rounded border px-2 py-1.5 text-[11px] transition",
        active
          ? "border-accent bg-accent/15 font-medium text-white"
          : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
