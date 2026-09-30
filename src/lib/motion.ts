/**
 * The app's motion vocabulary: three speeds and two curves, shared by every animated surface.
 *
 * Mirrors the `--duration-*` and `--ease-*` tokens in `index.css`, for the components that
 * animate through `motion` rather than CSS. Reduced motion is honoured once, by the
 * `MotionConfig` in `main.tsx`, not per component.
 */

import type { Transition } from "motion/react";

export const DURATION = { fast: 0.12, base: 0.2, slow: 0.32 } as const;

/** Things arriving: quick out of the gate, settling gently. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Things leaving: no settle, they are already gone in the reader's mind. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const enter: Transition = { duration: DURATION.base, ease: EASE_OUT };
export const leave: Transition = { duration: DURATION.fast, ease: EASE_IN };
export const spring: Transition = { type: "spring", stiffness: 500, damping: 38, mass: 0.8 };
