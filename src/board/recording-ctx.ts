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

export function createRecordingCtx(): Recording {
  const log: string[] = [];

  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: unknown[]) => {
          log.push(`${prop}(${args.map(fmt).join(",")})`);
          // measureText is the only method whose return value the renderer could
          // use; give it a plausible shape so nothing explodes if that changes.
          if (prop === "measureText") return { width: 0 };
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
