/**
 * PNG of the frame the scrubber is on.
 *
 * One frame needs no worker, and staying on the main thread means it works in
 * browsers without OffscreenCanvas too. It goes through the same `drawBoard` and
 * the same `exportView` as the video, so the still and the clip agree by
 * construction rather than by care.
 */

import type { BoardDoc, PitchView } from "@/board/types";
import { drawBoard } from "@/board/render";
import { exportSize, exportView } from "./frame";

export async function renderPng(
  doc: BoardDoc,
  t: number,
  pitchView: PitchView,
  longEdge: number,
): Promise<Blob> {
  const size = exportSize(longEdge, doc, pitchView);
  const view = exportView(doc, size, pitchView);

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The browser would not give us a 2D canvas.");
    drawBoard(ctx, doc, t, view);
    return canvas.convertToBlob({ type: "image/png" });
  }

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser would not give us a 2D canvas.");
  drawBoard(ctx, doc, t, view);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser produced no image."))),
      "image/png",
    );
  });
}
