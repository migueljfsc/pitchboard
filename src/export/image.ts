/**
 * PNG of the frame the scrubber is on, or of every scene on one sheet.
 *
 * One frame needs no worker, and staying on the main thread means it works in
 * browsers without OffscreenCanvas too. It goes through the same `drawBoard` and
 * the same `exportView` as the video, so the still and the clip agree by
 * construction rather than by care.
 */

import type { BoardDoc, PitchView } from "@/board/types";
import { drawBoard } from "@/board/render";
import { sceneStartSeconds } from "@/board/scenes";
import { exportSize, exportView, sheetLayout, type ExportLook, type ExportShape, type Size } from "./frame";

type Surface = { ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D; blob: () => Promise<Blob> };

function surface(size: Size): Surface {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The browser would not give us a 2D canvas.");
    return { ctx, blob: () => canvas.convertToBlob({ type: "image/png" }) };
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser would not give us a 2D canvas.");
  return {
    ctx,
    blob: () =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("The browser produced no image."))),
          "image/png",
        );
      }),
  };
}

export async function renderPng(
  doc: BoardDoc,
  t: number,
  pitchView: PitchView,
  longEdge: number,
  shape: ExportShape = "board",
  look: ExportLook = {},
): Promise<Blob> {
  const size = exportSize(longEdge, doc, pitchView, shape);
  const { ctx, blob } = surface(size);
  drawBoard(ctx, doc, t, exportView(doc, size, pitchView, look));
  return blob();
}

/** Behind and between the tiles of a sheet that is not transparent. */
const SHEET_BACKGROUND = "#101312";

/**
 * Every scene in `scenes` at the moment it comes to rest, a board apiece, each named in
 * its corner — the move as a handout. The caption's title, if any, heads the sheet once
 * rather than every tile.
 */
export async function renderSheet(
  doc: BoardDoc,
  scenes: number[],
  pitchView: PitchView,
  longEdge: number,
  shape: ExportShape = "board",
  look: ExportLook = {},
): Promise<Blob> {
  const title = look.caption?.title.trim() ?? "";
  const layout = sheetLayout(scenes.length, longEdge, doc, pitchView, shape, title !== "");
  const { ctx, blob } = surface(layout.size);
  if (!look.transparent) {
    ctx.fillStyle = SHEET_BACKGROUND;
    ctx.fillRect(0, 0, layout.size.width, layout.size.height);
  }

  const tile = surface(layout.tile);
  const view = exportView(doc, layout.tile, pitchView, {
    // Named unless a caption was asked for without the scene's name.
    caption: { title: "", scene: look.caption?.scene ?? true },
    transparent: look.transparent,
  });
  for (const [i, index] of scenes.entries()) {
    tile.ctx.clearRect(0, 0, layout.tile.width, layout.tile.height);
    drawBoard(tile.ctx, doc, sceneStartSeconds(doc, index), view);
    ctx.drawImage(tile.ctx.canvas, layout.tiles[i].x, layout.tiles[i].y);
  }

  if (title) {
    const unit = layout.header * 0.45;
    ctx.fillStyle = look.transparent ? "#000000" : "#ffffff";
    ctx.font = `700 ${unit}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(title, layout.tiles[0].x, layout.tiles[0].y / 2);
  }
  return blob();
}
