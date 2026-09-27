import { useEffect, useMemo, useRef, useState } from "react";
import { Film, ImageIcon, Loader2, X } from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { JsonPane } from "@/components/JsonPane";
import { sliceScenes, totalSeconds } from "@/board/scenes";
import { drawBoard } from "@/board/render";
import { SceneSelect } from "@/components/ui/SceneSelect";
import type { ExportJob } from "@/lib/useExportJob";
import { encodableFormats } from "@/export/capability";
import { renderPng, renderSheet } from "@/export/image";
import {
  MAX_GIF_RESOLUTION,
  EXPORT_SHAPES,
  RESOLUTIONS,
  exportSize,
  exportView,
  frameCount,
  sheetLayout,
  type ExportLook,
  type ExportShape,
  type Size,
} from "@/export/frame";
import {
  BITRATES,
  DEFAULT_FPS,
  FPS_OPTIONS,
  type ExportFormat,
  type ExportPhase,
  type VideoFormat,
} from "@/export/types";
import { useI18n } from "@/i18n/context";
import { loadExportPrefs, saveExportPrefs } from "@/share/exportPrefs";
import type { MessageKey } from "@/i18n/core";
import { cn, slug } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  /** The frame a PNG exports — whatever the scrubber is on. */
  t: number;
  /** The framing on screen. The export matches it rather than reframing. */
  pitchView: PitchView;
  onClose: () => void;
  /** The export itself, held by the editor so it outlives this dialog. */
  exportJob: ExportJob;
};

const LABEL: Record<ExportFormat, string> = {
  mp4: "MP4",
  webm: "WebM",
  gif: "GIF",
  png: "PNG",
};

/** Message keys, not words — this component's own `t` is a timestamp. */
const BLURB: Record<ExportFormat, MessageKey> = {
  mp4: "export.blurb.mp4",
  webm: "export.blurb.webm",
  gif: "export.blurb.gif",
  png: "export.blurb.png",
};

const SHAPE: Record<ExportShape, MessageKey> = {
  board: "export.shape.board",
  square: "export.shape.square",
  wide: "export.shape.wide",
};

/**
 * Whether this browser can ask where to save (the File System Access API). Where it
 * cannot, the file goes to the browser's downloads folder, and the dialog says so.
 */
const CAN_PICK_FOLDER = typeof window !== "undefined" && "showSaveFilePicker" in window;

const PHASE: Record<ExportPhase, MessageKey> = {
  palette: "export.phase.palette",
  render: "export.phase.render",
  finalise: "export.phase.finalise",
};

/**
 * MP4, WebM, GIF or PNG, all rendered by the same drawBoard the editor uses —
 * and JSON, which is not rendered at all.
 *
 * The clip formats go to a worker and render offline — faster than realtime,
 * dropping nothing, and leaving the UI alive. A PNG is one frame and stays here.
 *
 * JSON sits in the same row because it is what the coach is choosing between: a
 * way of getting the board out. It is NOT a fifth `ExportFormat`, though — it
 * never reaches `runExport`, and it has no resolution, frame rate or bitrate to
 * answer for. So it is a flag beside the encoder's format rather than a member
 * of it, and every encoder control hangs off `!json`.
 */
export function ExportDialog({ doc, t, pitchView, onClose, exportJob }: Props) {
  // `t` is already taken here — it is the frame a PNG exports — so the
  // translator keeps its full name rather than shadowing the time.
  const i18n = useI18n();
  // Every setting but the caption's words starts where this browser last left it.
  const [prefs] = useState(loadExportPrefs);
  const [format, setFormat] = useState<ExportFormat>(prefs.format);
  const [json, setJson] = useState(prefs.json);
  // A GIF wants a different size from a video, and one clamped list would mean
  // picking GIF then MP4 again silently exported at GIF's size. Two, so each
  // format keeps the size it was given.
  const [videoEdge, setVideoEdge] = useState<number>(prefs.videoEdge);
  const [gifEdge, setGifEdge] = useState<number>(prefs.gifEdge);
  const [fps, setFps] = useState(prefs.fps);
  const [bitrate, setBitrate] = useState<number>(prefs.bitrate);
  const [shape, setShape] = useState<ExportShape>(prefs.shape);
  // A caption is off until asked for, and seeded with the board's name when it is.
  const [captioned, setCaptioned] = useState(false);
  const [title, setTitle] = useState(doc.name);
  const [sceneCaption, setSceneCaption] = useState(prefs.sceneCaption);
  const [transparent, setTransparent] = useState(prefs.transparent);
  // Which scenes: ids, as a range is stored, so reordering in the editor underneath
  // does not quietly change what is exported. Null is the first scene, or the last.
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  // A PNG is the frame the scrubber is on, or every scene in the range on one sheet.
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    saveExportPrefs({ format, json, videoEdge, gifEdge, fps, bitrate, shape, sceneCaption, transparent });
  }, [format, json, videoEdge, gifEdge, fps, bitrate, shape, sceneCaption, transparent]);
  // Only this dialog's own format is shown as running here; another format's
  // export, started earlier, is still reported in the header.
  const job = exportJob.running;
  const { error, saved } = exportJob;
  /** The last capability answer, tagged with what it was an answer about. */
  const [probe, setProbe] = useState<{ key: string; formats: VideoFormat[] } | null>(null);


  const longEdge = format === "gif" ? gifEdge : videoEdge;
  const setLongEdge = format === "gif" ? setGifEdge : setVideoEdge;

  const indexOf = (id: string | null, fallback: number) => {
    const i = doc.scenes.findIndex((scene) => scene.id === id);
    return i < 0 ? fallback : i;
  };
  const ends = [indexOf(fromId, 0), indexOf(toId, doc.scenes.length - 1)];
  const [first, last] = [Math.min(...ends), Math.max(...ends)];
  const scenes = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const clip = useMemo(() => sliceScenes(doc, first, last), [doc, first, last]);
  const ranged = format !== "png" || sheet;

  const duration = totalSeconds(clip);
  const size = useMemo(
    () =>
      format === "png" && sheet
        ? sheetLayout(scenes.length, longEdge, doc, pitchView, shape, captioned && title.trim() !== "").size
        : exportSize(longEdge, doc, pitchView, shape),
    [format, sheet, scenes.length, longEdge, doc, pitchView, shape, captioned, title],
  );
  const look: ExportLook = {
    caption: captioned ? { title, scene: sceneCaption } : null,
    // Only a still keeps an alpha channel.
    transparent: format === "png" && transparent,
  };
  const { width, height } = size;
  const frames = format === "png" ? (sheet ? scenes.length : 1) : frameCount(duration, fps);

  // Sizes a format can sensibly take. A GIF is a frame of pixels per frame, so
  // the big ones are a trap rather than an option.
  const sizes = useMemo(
    () => RESOLUTIONS.filter((r) => format !== "gif" || r <= MAX_GIF_RESOLUTION),
    [format],
  );

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
  const forget = exportJob.forget;

  const chooseFormat = (next: ExportFormat) => {
    forget();
    setFormat(next);
    if (next !== "png") setFps(DEFAULT_FPS[next]);
  };

  const start = () => {
    const name = slug(doc.name);
    // Each asks where to save before anything renders — the save dialog only opens
    // in direct answer to this click.
    if (format === "png") {
      void exportJob.startPng(
        () =>
          sheet
            ? renderSheet(doc, scenes, pitchView, longEdge, shape, look)
            : renderPng(doc, t, pitchView, longEdge, shape, look),
        name,
      );
      return;
    }
    void exportJob.startClip({ doc: clip, pitchView, format, size, fps, bitrate, look }, name);
  };

  const cancel = exportJob.cancel;

  // Closing never cancels: an export in progress carries on, reported in the
  // header, and downloads itself when it is done.
  const close = onClose;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[6vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="export-title" className="text-sm font-semibold text-white">
            {i18n.t("export.title")}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={i18n.t("export.close")}
            className="ml-auto flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <Field label={i18n.t("export.format")}>
            <div className="flex flex-wrap gap-1">
              {(["mp4", "webm", "gif", "png"] as const).map((f) => (
                <Choice
                  key={f}
                  active={!json && format === f}
                  onClick={() => {
                    setJson(false);
                    chooseFormat(f);
                  }}
                >
                  {LABEL[f]}
                </Choice>
              ))}
              <Choice
                active={json}
                onClick={() => {
                  forget();
                  setJson(true);
                }}
              >
                JSON
              </Choice>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">
              {i18n.t(json ? "export.blurb.json" : format === "png" && sheet ? "export.blurb.sheet" : BLURB[format])}
            </p>
            {!json && unavailable && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300">
                {i18n.t("export.unavailable", {
                  format: LABEL[format],
                  width: size.width,
                  height: size.height,
                })}
                {encodable && encodable.length > 0
                  ? i18n.t("export.unavailable.try", { alternative: LABEL[encodable[0]] })
                  : i18n.t("export.unavailable.smaller")}
              </p>
            )}
          </Field>

          {json && <JsonPane doc={doc} />}

          {!json && (
            <>
            <ExportPreview
              doc={format === "png" ? doc : clip}
              pitchView={pitchView}
              size={size}
              shape={shape}
              look={look}
              still={format === "png" && !sheet ? t : null}
              sheet={format === "png" && sheet ? { scenes, longEdge } : null}
            />

            {format === "png" && (
              <Field label={i18n.t("export.png.what")}>
                <div className="flex flex-wrap gap-1">
                  {([false, true] as const).map((each) => (
                    <Choice
                      key={String(each)}
                      active={sheet === each}
                      onClick={() => {
                        forget();
                        setSheet(each);
                      }}
                    >
                      {i18n.t(each ? "export.png.sheet" : "export.png.frame")}
                    </Choice>
                  ))}
                </div>
              </Field>
            )}

            {ranged && doc.scenes.length > 1 && (
              <Field label={i18n.t("export.scenes")}>
                <div className="flex items-center gap-2 text-[11px] text-ink-400">
                  <SceneSelect
                    title={i18n.t("export.scenes.from")}
                    doc={doc}
                    value={doc.scenes[first].id}
                    onChange={(id) => {
                      forget();
                      setFromId(id);
                    }}
                  />
                  <span>→</span>
                  <SceneSelect
                    title={i18n.t("export.scenes.to")}
                    doc={doc}
                    value={doc.scenes[last].id}
                    onChange={(id) => {
                      forget();
                      setToId(id);
                    }}
                  />
                </div>
              </Field>
            )}

            <Field label={i18n.t(format === "png" ? "export.size" : "export.resolution")}>
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

            <Field label={i18n.t("export.shape")}>
              <div className="flex flex-wrap gap-1">
                {EXPORT_SHAPES.map((s) => (
                  <Choice
                    key={s}
                    active={shape === s}
                    onClick={() => {
                      forget();
                      setShape(s);
                    }}
                  >
                    {i18n.t(SHAPE[s])}
                  </Choice>
                ))}
              </div>
            </Field>

            {format !== "png" && (
              <Field label={i18n.t("export.frameRate")}>
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
              <Field label={i18n.t("export.bitrate")}>
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

            <Field label={i18n.t("export.look")}>
              <div className="flex flex-col gap-2 text-[11px] text-ink-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={captioned}
                    onChange={(e) => {
                      forget();
                      setCaptioned(e.target.checked);
                    }}
                    className="accent-accent"
                  />
                  {i18n.t("export.caption")}
                </label>
                {captioned && (
                  <div className="flex flex-col gap-2 pl-5">
                    <input
                      value={title}
                      onChange={(e) => {
                        forget();
                        setTitle(e.target.value);
                      }}
                      placeholder={i18n.t("export.caption.placeholder")}
                      aria-label={i18n.t("export.caption.title")}
                      className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-200 outline-none focus:border-accent"
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sceneCaption}
                        onChange={(e) => {
                          forget();
                          setSceneCaption(e.target.checked);
                        }}
                        className="accent-accent"
                      />
                      {i18n.t("export.caption.scene")}
                    </label>
                  </div>
                )}
                {format === "png" && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={transparent}
                      onChange={(e) => {
                        forget();
                        setTransparent(e.target.checked);
                      }}
                      className="accent-accent"
                    />
                    {i18n.t("export.transparent")}
                  </label>
                )}
              </div>
            </Field>

            {/* What is actually about to be produced. The dimensions come from the
                same exportSize the worker uses, so this is a statement rather than
                an estimate. */}
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded border border-ink-700 bg-ink-900 px-3 py-2.5 font-mono text-[11px]">
              <Stat label={i18n.t("export.size")}>
                {size.width}×{size.height}
              </Stat>
              <Stat label={i18n.t(format === "png" ? (sheet ? "export.scenes" : "export.frame") : "export.frames")}>
                {format === "png" ? (sheet ? frames : `${t.toFixed(2)}s`) : frames}
              </Stat>
              <Stat label={i18n.t("export.length")}>{format === "png" ? "—" : `${duration.toFixed(1)}s`}</Stat>
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
                  onClick={exportJob.downloadAgain}
                  className="ml-auto text-accent transition hover:brightness-110"
                >
                  {i18n.t("export.again")}
                </button>
              </div>
            )}

            {job ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[11px] text-ink-300">
                  <Loader2 size={13} className="animate-spin text-accent" />
                  <span>{i18n.t(PHASE[job.phase])}</span>
                  {format !== "png" && (
                    <span className="ml-auto font-mono">{Math.round(job.fraction * 100)}%</span>
                  )}
                </div>
                {format !== "png" && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, job.fraction * 100)}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    title={i18n.t("export.background.hint")}
                    className="rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 transition hover:border-ink-400 hover:text-white"
                  >
                    {i18n.t("export.background")}
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={job.format === "png"}
                    className="rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 transition enabled:hover:border-ink-400 enabled:hover:text-white disabled:opacity-45"
                  >
                    {i18n.t("export.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={unavailable}
                className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-ink-900 transition enabled:hover:brightness-110 disabled:opacity-45"
              >
                {format === "png" ? <ImageIcon size={13} /> : <Film size={13} />}
                {i18n.t("export.run", { format: LABEL[format] })}
              </button>
            )}
            {!job && (
              <p className="-mt-2 text-center text-[11px] text-ink-400">
                {i18n.t(CAN_PICK_FOLDER ? "export.where.pick" : "export.where.downloads")}
              </p>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


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

/** The preview's long side, in CSS pixels. */
const PREVIEW_EDGE = 460;
const PREVIEW_MAX_HEIGHT = 200;

/**
 * What is about to be exported, small: the shape, the caption and the scenes chosen.
 * A clip plays on a loop, a still holds its frame, a sheet is the sheet. Drawn through
 * the export's own view, so it agrees with the file by construction.
 */
function ExportPreview({
  doc,
  pitchView,
  size,
  shape,
  look,
  still,
  sheet,
}: {
  doc: BoardDoc;
  pitchView: PitchView;
  size: Size;
  shape: ExportShape;
  look: ExportLook;
  /** The time a single PNG is taken at; null plays the clip. */
  still: number | null;
  sheet: { scenes: number[]; longEdge: number } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const scale = Math.min(PREVIEW_EDGE / size.width, PREVIEW_MAX_HEIGHT / size.height);
  const cssWidth = Math.round(size.width * scale);
  const cssHeight = Math.round(size.height * scale);
  const css = { width: cssWidth, height: cssHeight };
  // Primitives, not the objects the dialog rebuilds every render — or the preview would
  // start its loop again on every keystroke.
  const title = look.caption ? look.caption.title : null;
  const named = look.caption?.scene ?? false;
  const transparent = look.transparent ?? false;
  const scenesKey = sheet?.scenes.join(",") ?? "";
  const isSheet = sheet !== null;

  useEffect(() => {
    if (isSheet) return;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    // DPR lives in the canvas transform, never in the view (invariant 2).
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.max(2, Math.round(cssWidth * dpr));
    el.height = Math.max(2, Math.round(cssHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const caption = title === null ? null : { title, scene: named };
    const view = exportView(doc, { width: cssWidth, height: cssHeight }, pitchView, { caption, transparent });
    if (still !== null) {
      drawBoard(ctx, doc, still, view);
      return;
    }
    const duration = Math.max(totalSeconds(doc), 0.001);
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      drawBoard(ctx, doc, ((now - began) / 1000) % duration, view);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [doc, pitchView, cssWidth, cssHeight, title, named, transparent, still, isSheet]);

  useEffect(() => {
    if (!isSheet) return;
    let live = true;
    let url: string | null = null;
    const scenes = scenesKey.split(",").map(Number);
    const caption = title === null ? null : { title, scene: named };
    void renderSheet(doc, scenes, pitchView, PREVIEW_EDGE * 2, shape, { caption, transparent }).then((blob) => {
      if (!live) return;
      url = URL.createObjectURL(blob);
      setSheetUrl(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, pitchView, shape, title, named, transparent, scenesKey, isSheet]);

  return (
    <div className="flex justify-center rounded border border-ink-700 bg-ink-900 p-2">
      {sheet ? (
        sheetUrl && <img src={sheetUrl} alt="" style={css} className="block" />
      ) : (
        <canvas ref={canvas} style={css} className="block" />
      )}
    </div>
  );
}
