/**
 * A scene, drawn small.
 *
 * The strip named scenes and showed nothing else, which reads well at three and
 * not at all at ten. This is the same `drawBoard` the editor and the exporter
 * run, through the same `exportView` the export dialog sizes with — there is no
 * second renderer and no second idea of what a board looks like.
 */

import { memo, useEffect, useRef } from "react";
import type { BoardDoc, PitchView } from "@/board/types";
import { drawBoard } from "@/board/render";
import { sceneStartSeconds } from "@/board/scenes";
import { exportView } from "@/export/frame";

/**
 * Thumbnail box in CSS pixels, fixed for every scene.
 *
 * A uniform tile costs grass bands on a vertical board — `fitViewport` letterboxes
 * whatever it is given — and that is the right trade in a strip: scenes the same
 * size are comparable at a glance, scenes that jump between aspects are not.
 */
export const THUMB_WIDTH = 112;
export const THUMB_HEIGHT = 72;

type Props = {
  doc: BoardDoc;
  /** Scene to draw, at rest. */
  index: number;
  view: PitchView;
};

function Thumb({ doc, index, view }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // DPR lives here and only here — never in Viewport.scale.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(THUMB_WIDTH * dpr);
    canvas.height = Math.round(THUMB_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The angled camera is unreadable at this size and wants an OffscreenCanvas
    // per redraw. A thumbnail follows the crop and the rotation and stops there.
    const flat: PitchView = { ...view, tilt: false };
    const size = { width: THUMB_WIDTH, height: THUMB_HEIGHT };

    // `sceneStartSeconds` is the instant the scene comes to rest, so what is drawn
    // is its stored positions rather than anything interpolated — in flow mode too,
    // where the seam tolerance resolves a zero-length hold to the scene itself.
    drawBoard(ctx, doc, sceneStartSeconds(doc, index), exportView(doc, size, flat));
  }, [doc, index, view]);

  return (
    <canvas
      ref={ref}
      style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      className="block rounded-sm"
      aria-hidden="true"
    />
  );
}

/**
 * A drag emits a document per `pointermove`, and redrawing every thumbnail on
 * each one is a full board render per scene per frame.
 *
 * Scenes are replaced immutably, so identity answers "did this scene change"
 * exactly: during a player drag one tile redraws and the rest stand. The other
 * fields are everything else `drawBoard` reads that a thumbnail can see. Timings
 * are deliberately absent — they move the instant drawn, never the picture, which
 * is the scene at rest either way.
 */
const same = (a: Props, b: Props): boolean =>
  a.index === b.index &&
  a.view === b.view &&
  a.doc.scenes.length === b.doc.scenes.length &&
  a.doc.scenes[a.index] === b.doc.scenes[b.index] &&
  a.doc.teams === b.doc.teams &&
  a.doc.links === b.doc.links &&
  a.doc.annotations === b.doc.annotations &&
  a.doc.pitch === b.doc.pitch &&
  a.doc.tokenScale === b.doc.tokenScale;

export const SceneThumb = memo(Thumb, same);
