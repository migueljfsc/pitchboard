import { useId } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** The home side's default kit, the ball's colour: the one warm note in the brand (D128). */
const AMBER = "#f59e0b";
const CHALK = "var(--color-accent)";
const INK = "#0e1f17";

/** A `useId` safe inside `url(#…)`, which React's own punctuation breaks. */
const useSvgId = () => `chalk${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

/**
 * Chalk grain: edges roughened, then dust knocked out of the stroke. Deterministic — fixed
 * seeds — so a mark draws the same every time. Noise is measured in the user units of what it
 * filters, so `px` (screen pixels per unit) keeps the grain the same size on every drawing.
 * Below about 40 px it only blurs, so the small marks leave it off.
 */
export function ChalkFilter({ id, px = 1 }: { id: string; px?: number }) {
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency={0.5 * px} numOctaves="2" seed="3" result="warp" />
      <feDisplacementMap in="SourceGraphic" in2="warp" scale={2.5 / px} result="rough" />
      <feTurbulence type="fractalNoise" baseFrequency={1.1 * px} numOctaves="1" seed="8" result="dust" />
      <feColorMatrix in="dust" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -3 2.3" result="mask" />
      <feComposite in="rough" in2="mask" operator="in" />
    </filter>
  );
}

/** A chalk filter for HTML, by a fixed id that `filter: url(#id)` names. Render it once per page. */
export function ChalkDefs({ id }: { id: string }) {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <ChalkFilter id={id} />
    </svg>
  );
}

/**
 * The mark: the oldest drawing in coaching — a player, his run, the space he runs into.
 * An X, a dashed arc, an O, in chalk. `chalk` adds the grain, for sizes it survives at.
 * `public/favicon.svg` is the same drawing on a tile, the run solid.
 */
export function LogoMark({ className, chalk = false }: { className?: string; chalk?: boolean }) {
  const filter = useSvgId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6", className)}>
      {chalk && <ChalkFilter id={filter} px={1.25} />}
      <g
        fill="none"
        stroke={CHALK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={chalk ? `url(#${filter})` : undefined}
      >
        <path d="M4.4 19.9 11.6 27.1 M11.6 19.9 4.4 27.1" />
        <path d="M9.5 17 C 10.5 5, 22 4.5, 23.5 16" strokeDasharray="3.2 3" />
        <path d="M23.5 16 l1.8 -3.6 M23.5 16 l-2.8 -2.9" />
        <circle cx="24.2" cy="23.6" r="3.6" />
      </g>
    </svg>
  );
}

/** A hand-drawn stroke under a word, in amber. Stretches to its box; the line keeps its weight. */
export function ChalkStroke({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      aria-hidden
      className={cn("block", className)}
    >
      <path
        d="M1 5.6 C 30 2.2, 64 1.6, 99 3.8"
        fill="none"
        stroke={AMBER}
        strokeWidth="2.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className="size-7" />
      <span className="relative pb-1 text-[17px] font-extrabold leading-none tracking-[-0.01em] text-white font-stretch-expanded">
        {name}
        <ChalkStroke className="absolute inset-x-0 -bottom-0.5 h-1.5 w-full" />
      </span>
    </span>
  );
}

// ------------------------------------------------------------ the signature

type Point = readonly [number, number];

/** Three shapes of one chain, each held, then run to the next. */
const SHAPES: readonly (readonly [Point, Point, Point])[] = [
  [[16, 54], [56, 16], [104, 44]],
  [[30, 38], [66, 26], [96, 58]],
  [[20, 26], [52, 40], [100, 24]],
];
const SHIRTS = [6, 8, 10] as const;
const LOOP_S = 7.5;
/** Hold, run, hold, run, hold, run — as fractions of the loop. */
const KEY_TIMES = "0;0.12;0.33;0.45;0.66;0.78;1";
const KEY_SPLINES = Array(6).fill("0.65 0 0.35 1").join(";");
/** Each shape twice, for its hold, then back to the first. */
const FRAMES = [0, 0, 1, 1, 2, 2, 0] as const;

const chain = (shape: readonly Point[]) => `M${shape.map(([x, y]) => `${x} ${y}`).join(" L")}`;

/**
 * The signature: three players and the link between them, the link bending as they run — the
 * board's one idea nobody else has. It loops on its own clock (SMIL), so it needs no frames
 * from the page; asked for less motion, it is the first shape, still. `px` is the screen pixels
 * per unit it is drawn at, for the chalk's grain (`ChalkFilter`).
 */
export function LiveLinkMark({ className, px = 1.2 }: { className?: string; px?: number }) {
  const still = useReducedMotion() ?? false;
  const filter = useSvgId();
  const timing = {
    dur: `${LOOP_S}s`,
    repeatCount: "indefinite",
    calcMode: "spline",
    keyTimes: KEY_TIMES,
    keySplines: KEY_SPLINES,
  } as const;

  return (
    <svg viewBox="0 0 120 72" aria-hidden className={cn("block", className)}>
      <ChalkFilter id={filter} px={px} />
      <path
        d={chain(SHAPES[0])}
        fill="none"
        stroke={CHALK}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${filter})`}
      >
        {!still && <animate attributeName="d" values={FRAMES.map((f) => chain(SHAPES[f])).join(";")} {...timing} />}
      </path>
      {SHIRTS.map((shirt, i) => {
        const [x0, y0] = SHAPES[0][i];
        return (
          <g key={shirt}>
            {!still && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values={FRAMES.map((f) => `${SHAPES[f][i][0] - x0} ${SHAPES[f][i][1] - y0}`).join(";")}
                {...timing}
              />
            )}
            <circle cx={x0} cy={y0} r="9" fill={AMBER} stroke={INK} strokeWidth="1.5" />
            <text
              x={x0}
              y={y0 + 3.3}
              textAnchor="middle"
              fill={INK}
              fontSize="9.5"
              fontWeight="800"
              fontFamily="Archivo, system-ui, sans-serif"
            >
              {shirt}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
