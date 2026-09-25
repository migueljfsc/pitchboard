/**
 * The export worker.
 *
 * It receives one request, renders the board offline through the same
 * `drawBoard` the editor uses, and posts the finished file back. It holds no
 * state between requests — the client spawns a worker per export and terminates
 * it when the export ends, cancelled or not.
 */

import { loadBoardFonts } from "@/fonts";
import { encodeGif } from "./gif";
import { encodeVideo } from "./video";
import type { ExportPhase, ExportRequest, WorkerMessage } from "./types";

/**
 * The worker global, narrowed to the two members this file uses.
 *
 * The project compiles against lib.dom, where `self` is a Window. Pulling in
 * lib.webworker for one file redeclares half of that and breaks the app build,
 * so naming what is actually called is the smaller lie.
 */
const scope = self as unknown as {
  postMessage: (message: WorkerMessage, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null;
  fonts: FontFaceSet;
};

const post = (message: WorkerMessage) => scope.postMessage(message);

scope.onmessage = (event) => {
  void run(event.data);
};

async function run(request: ExportRequest): Promise<void> {
  try {
    // The worker has no stylesheet, so the label face has to be registered here as well.
    await loadBoardFonts(scope.fonts);
    const report = (phase: ExportPhase, done: number, total: number) =>
      post({ kind: "progress", phase, done, total });

    const result =
      request.format === "gif"
        ? encodeGif(request, report)
        : await encodeVideo(request, report);

    // Transferred, not copied: a 1080p60 clip is tens of megabytes and cloning
    // it doubles the peak memory for no reason.
    scope.postMessage({ kind: "done", result }, [result.buffer]);
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
