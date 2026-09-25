import { useCallback, useEffect, useRef, useState } from "react";
import { runExport, type ExportHandle } from "@/export/client";
import type { ExportFormat, ExportPhase, ExportRequest } from "@/export/types";

/**
 * Where a finished export goes: a file the coach chose through the system's save
 * dialog, or — where the browser has no such dialog — an ordinary download into
 * the browser's downloads folder.
 */
type Target =
  | { kind: "file"; handle: SaveHandle; name: string }
  | { kind: "download"; name: string };

/** The slice of the File System Access API used here. Chrome and Edge have it; others do not. */
type SaveHandle = {
  name: string;
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
};
type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

const MIME: Record<ExportFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  gif: "image/gif",
  png: "image/png",
};

/**
 * Ask where to save, while the click that started the export still counts as the
 * coach's: the save dialog may only open in direct answer to one, and an export
 * finishes long after. `null` when the dialog was cancelled — the export does not
 * start. No dialog in this browser, and it is a download.
 */
async function chooseTarget(name: string, format: ExportFormat): Promise<Target | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  const file = `${name}.${format}`;
  if (!picker) return { kind: "download", name: file };
  try {
    const handle = await picker({
      suggestedName: file,
      types: [{ description: format.toUpperCase(), accept: { [MIME[format]]: [`.${format}`] } }],
    });
    return { kind: "file", handle, name: handle.name };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return { kind: "download", name: file };
  }
}

/** An export in progress: which format, where it has got to. */
export type ExportRunning = {
  format: ExportFormat;
  phase: ExportPhase;
  fraction: number;
  /** Running on the page because the worker could not start: the page may pause until done. */
  onPage?: boolean;
};

/** The export in progress and the last file it made, outliving the dialog that started it. */
export type ExportJob = {
  running: ExportRunning | null;
  error: string | null;
  /** The last file produced, as "name — size", while it is still the answer to the settings. */
  saved: string | null;
  /** Asks where to save first; resolves once the export has started, or was cancelled. */
  startClip: (request: ExportRequest, name: string) => Promise<void>;
  startPng: (render: () => Promise<Blob>, name: string) => Promise<void>;
  cancel: () => void;
  /** Download the last file again, with no re-encode. */
  downloadAgain: () => void;
  /** Drop the last result: the settings it came from have changed. */
  forget: () => void;
};

/**
 * One export at a time, owned by the editor rather than the dialog.
 *
 * Closing the dialog used to terminate the worker, so a long clip meant sitting
 * and watching a progress bar. Held here, the export carries on while the board is
 * worked on, the header shows how far it has got, and the file downloads itself
 * when it is done. Leaving the editor still ends it.
 */
export function useExportJob(): ExportJob {
  const handle = useRef<ExportHandle | null>(null);
  const file = useRef<{ data: Blob; name: string } | null>(null);
  const [running, setRunning] = useState<ExportRunning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => () => handle.current?.cancel(), []);

  /**
   * Put the finished file where it was asked to go. A video can come back in a
   * different container than asked for — the codec ladder may not reach MP4 — and
   * a file chosen as `.mp4` must not be filled with WebM, so that one downloads
   * under its real name instead.
   */
  const save = useCallback(async (data: Blob, extension: string, target: Target) => {
    const matches = target.name.toLowerCase().endsWith(`.${extension}`);
    const name = matches ? target.name : target.name.replace(/\.[^.]+$/, "") + `.${extension}`;
    file.current = { data, name };
    if (target.kind === "file" && matches) {
      try {
        const out = await target.handle.createWritable();
        await out.write(data);
        await out.close();
        setSaved(`${name} — ${megabytes(data.size)}`);
        return;
      } catch {
        // Fall through to a download rather than lose the export.
      }
    }
    download(file.current);
    setSaved(`${name} — ${megabytes(data.size)}`);
  }, []);

  const startClip = useCallback(
    async (request: ExportRequest, name: string) => {
      const target = await chooseTarget(name, request.format);
      if (!target) return;
      setError(null);
      setSaved(null);
      setRunning({ format: request.format, phase: "render", fraction: 0 });
      handle.current = runExport(request, {
        onProgress: (phase, fraction) =>
          setRunning((r) => ({ format: request.format, phase, fraction, onPage: r?.onPage })),
        onFallback: () => setRunning((r) => (r ? { ...r, onPage: true } : r)),
        onDone: (result) => {
          handle.current = null;
          setRunning(null);
          void save(new Blob([result.buffer], { type: result.mime }), result.extension, target);
        },
        onError: (message) => {
          handle.current = null;
          setRunning(null);
          setError(message);
        },
      });
    },
    [save],
  );

  const startPng = useCallback(
    async (render: () => Promise<Blob>, name: string) => {
      const target = await chooseTarget(name, "png");
      if (!target) return;
      setError(null);
      setSaved(null);
      setRunning({ format: "png", phase: "render", fraction: 0 });
      void render()
        .then((png) => save(png, "png", target))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setRunning(null));
    },
    [save],
  );

  const cancel = useCallback(() => {
    handle.current?.cancel();
    handle.current = null;
    setRunning(null);
  }, []);

  const downloadAgain = useCallback(() => {
    if (file.current) download(file.current);
  }, []);

  const forget = useCallback(() => {
    setSaved(null);
    setError(null);
    file.current = null;
  }, []);

  return { running, error, saved, startClip, startPng, cancel, downloadAgain, forget };
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
