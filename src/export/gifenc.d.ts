/**
 * gifenc ships no types. Only the four members the encoder uses are declared,
 * against the API in its README and src/index.js.
 */
declare module "gifenc" {
  /** RGB triples, at most 256 of them. */
  export type Palette = number[][];

  export type QuantizeFormat = "rgb565" | "rgb444" | "rgba4444";

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: QuantizeFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: QuantizeFormat,
  ): Uint8Array;

  export type FrameOptions = {
    palette?: Palette | null;
    /** Milliseconds; the encoder rounds to centiseconds itself. */
    delay?: number;
    /** -1 once, 0 forever, >0 a count. Read from the first frame only. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  };

  export type Encoder = {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  };

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): Encoder;
}
