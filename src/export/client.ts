/**
 * Main-thread handle on an export.
 *
 * One worker per export, terminated when it ends. Cancelling is termination
 * rather than a cooperative flag: the encode loop is a tight synchronous run in
 * a thread of its own, and killing the scope takes the VideoEncoder and the
 * OffscreenCanvas with it. Nothing is left to leak.
 */

import type { ExportPhase, ExportRequest, ExportResult, WorkerMessage } from "./types";

export type ExportHandlers = {
  onProgress?: (phase: ExportPhase, fraction: number) => void;
  onDone: (result: ExportResult) => void;
  onError: (message: string) => void;
  /** The worker could not start, and the export is running on the page instead. */
  onFallback?: () => void;
};

export type ExportHandle = {
  /** Terminates the worker. Safe to call after the export has already ended. */
  cancel: () => void;
};

export function runExport(request: ExportRequest, handlers: ExportHandlers): ExportHandle {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch (error) {
    console.error("[export] could not create the worker; rendering on the page instead", error);
    handlers.onFallback?.();
    return runInPage(request, handlers);
  }

  let live = true;
  // Anything heard from the worker means it loaded: from then on a failure is the
  // export's, and is reported rather than retried.
  let started = false;
  let fallback: ExportHandle | null = null;
  const stop = () => {
    fallback?.cancel();
    if (!live) return;
    live = false;
    worker.terminate();
  };

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    started = true;
    const message = event.data;
    if (message.kind === "progress") {
      handlers.onProgress?.(message.phase, message.total ? message.done / message.total : 0);
      return;
    }
    // Both remaining outcomes are terminal, so the worker goes either way.
    stop();
    if (message.kind === "done") handlers.onDone(message.result);
    else handlers.onError(message.message);
  };

  // A worker that fails to load never posts anything, so without this the dialog
  // would sit at 0% for ever. One that fails before it has said anything could not
  // start at all — a browser that will not run module workers, a stale dev build —
  // and the export is run on the page instead: slower, and the page stutters while
  // it encodes, but the coach gets the file. What went wrong is logged, so the
  // failure can be found rather than guessed at.
  worker.onerror = (event) => {
    console.error("[export] worker error", {
      message: event.message,
      file: event.filename,
      line: event.lineno,
      column: event.colno,
    });
    const before = !started;
    stop();
    if (before) {
      handlers.onFallback?.();
      fallback = runInPage(request, handlers);
      return;
    }
    handlers.onError(event.message || "The export worker failed to start.");
  };

  worker.postMessage(request);
  return { cancel: stop };
}

/**
 * The same export, run on the page rather than in a worker — the fallback when the
 * worker cannot start. The encoders are the worker's own, imported only when
 * needed. Cancelling can only take effect between progress reports: a synchronous
 * encode on the page cannot be interrupted part-way (which is why the worker is
 * preferred).
 */
function runInPage(request: ExportRequest, handlers: ExportHandlers): ExportHandle {
  let cancelled = false;
  void (async () => {
    try {
      // Let the page paint "rendering" before a synchronous encode takes it over.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const report = (phase: ExportPhase, done: number, total: number) => {
        if (cancelled) throw new Error("cancelled");
        handlers.onProgress?.(phase, total ? done / total : 0);
      };
      const result =
        request.format === "gif"
          ? (await import("./gif")).encodeGif(request, report)
          : await (await import("./video")).encodeVideo(request, report);
      if (!cancelled) handlers.onDone(result);
    } catch (error) {
      if (!cancelled) handlers.onError(error instanceof Error ? error.message : String(error));
    }
  })();
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}
