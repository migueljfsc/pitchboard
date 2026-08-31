/**
 * A canvas context that records instead of painting.
 *
 * Lets the renderer be tested with no canvas polyfill and no image diffing — the
 * command log makes draw order and geometry directly assertable. Test-only, but it
 * lives in src/ so it is type-checked alongside the code it mirrors.
 */

import type { Ctx } from "./pitch";

export type Recording = {
  ctx: Ctx;
  /** Ordered log, e.g. `fillStyle="#fff"`, `arc(52.5,34,9.15,0,6.283)`. */
  log: string[];
  /** Just the operation names, in order. */
  ops: () => string[];
  calls: (name: string) => string[];
  count: (name: string) => number;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

const fmt = (v: unknown): string => {
  if (typeof v === "number") return String(round(v));
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(fmt).join(",")}]`;
  return String(v);
};

/**
 * A stand-in for CanvasGradient. Its stops are logged like everything else, and it
 * names itself so `fillStyle=gradient` reads in the log rather than `[object
 * Object]`.
 */
function gradient(log: string[]): CanvasGradient {
  return {
    addColorStop: (offset: number, color: string) => {
      log.push(`addColorStop(${fmt(offset)},${fmt(color)})`);
    },
    toString: () => "gradient",
  } as unknown as CanvasGradient;
}

export function createRecordingCtx(): Recording {
  const log: string[] = [];

  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: unknown[]) => {
          log.push(`${prop}(${args.map(fmt).join(",")})`);
          // Two methods hand back something the renderer then uses. Returning
          // undefined for either is a crash rather than a missing log line.
          if (prop === "measureText") return { width: 0 };
          if (prop === "createRadialGradient" || prop === "createLinearGradient") {
            return gradient(log);
          }
          return undefined;
        };
      },
      set(_t, prop: string, value: unknown) {
        log.push(`${prop}=${fmt(value)}`);
        return true;
      },
    },
  ) as Ctx;

  const name = (entry: string) => entry.slice(0, Math.max(entry.indexOf("("), entry.indexOf("=")));

  return {
    ctx,
    log,
    ops: () => log.map(name),
    calls: (n: string) => log.filter((e) => e.startsWith(`${n}(`)),
    count: (n: string) => log.filter((e) => e.startsWith(`${n}(`)).length,
  };
}
