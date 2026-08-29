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
};

export type ExportHandle = {
  /** Terminates the worker. Safe to call after the export has already ended. */
  cancel: () => void;
};

export function runExport(request: ExportRequest, handlers: ExportHandlers): ExportHandle {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

  let live = true;
  const stop = () => {
    if (!live) return;
    live = false;
    worker.terminate();
  };

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
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
  // would sit at 0% for ever.
  worker.onerror = (event) => {
    stop();
    handlers.onError(event.message || "The export worker failed to start.");
  };

  worker.postMessage(request);
  return { cancel: stop };
}
