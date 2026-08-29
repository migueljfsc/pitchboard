/** Cheap relative-luminance pick so numbers stay readable on any kit colour. */
export function contrastOn(hex: string): string {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  if (full.length !== 6) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  if ([r, g, b].some(Number.isNaN)) return "#ffffff";
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#0b1210" : "#ffffff";
}
