/**
 * What each sport's court is drawn with: its theme, shaded as the document asks, and the
 * function that lays the surface and its markings. The one place a court's drawing is
 * chosen, so the renderer never asks which sport it is drawing.
 */

import type { BoardDoc, Grass, Sport, TurfCache } from "./types";
import { drawPitch, themeFor, type Ctx, type PitchTheme } from "./pitch";
import { drawCourt, floorTheme } from "./court";
import { drawFutsalCourt, futsalTheme } from "./futsal";
import { drawHandballCourt, hallTheme } from "./handball";
import { drawHockeyPitch, turfTheme } from "./hockey";
import { drawVolleyballCourt, volleyballTheme } from "./volleyball";
import { sportOf } from "./sports";

type Surface = {
  theme: (doc: { grass?: Grass }) => PitchTheme;
  /** `goals` false where they are drawn standing up instead -- the 3D view's ground layer. */
  draw: (ctx: Ctx, pitch: { length: number; width: number }, theme: PitchTheme, goals: boolean, turf?: TurfCache) => void;
};

const SURFACES: Record<Sport, Surface> = {
  football: { theme: themeFor, draw: drawPitch },
  futsal: { theme: futsalTheme, draw: drawFutsalCourt },
  basketball: { theme: floorTheme, draw: drawCourt },
  handball: { theme: hallTheme, draw: drawHandballCourt },
  hockey: { theme: turfTheme, draw: drawHockeyPitch },
  volleyball: { theme: volleyballTheme, draw: drawVolleyballCourt },
};

export const surfaceOf = (doc: Pick<BoardDoc, "sport">): Surface => SURFACES[sportOf(doc).id];
