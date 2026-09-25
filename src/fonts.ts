import { TEXT_FONT_FAMILY } from "@/board/glyphs";
import latin from "@/assets/fonts/inter-latin-700.woff2?url";
import latinExt from "@/assets/fonts/inter-latin-ext-700.woff2?url";

/**
 * The face text labels are set in, registered where the canvas can find it.
 *
 * `glyphs.ts` holds this face's advances, so a label only wraps, fits and hit-tests exactly
 * when this is the font that draws it. Registered through `FontFace` rather than CSS because
 * the export worker has no stylesheet, and both have to draw the same letters. Its own family
 * name, and bold only, so the UI's `Inter` stack is untouched.
 *
 * Never throws and never waits long: a label drawn in the fallback face is slightly
 * misfitted, which is better than a board that does not open.
 */
export async function loadBoardFonts(target: FontFaceSet, timeoutMs = 2000): Promise<void> {
  const faces = [
    new FontFace(TEXT_FONT_FAMILY, `url(${latin})`, {
      weight: "700",
      unicodeRange:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    }),
    new FontFace(TEXT_FONT_FAMILY, `url(${latinExt})`, {
      weight: "700",
      unicodeRange:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    }),
  ];
  const loaded = Promise.all(
    faces.map(async (face) => {
      target.add(await face.load());
    }),
  ).catch(() => undefined);
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
