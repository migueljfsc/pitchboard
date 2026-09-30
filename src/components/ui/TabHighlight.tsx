import { motion } from "motion/react";
import { spring } from "@/lib/motion";

/**
 * The selected tab's background, one element that slides between the tabs of a pill rather
 * than a highlight that blinks from one to the next. Rendered inside the selected tab, which
 * must be `relative isolate`; `id` names the pill, and must be unique among those on screen.
 */
export function TabHighlight({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden
      transition={spring}
      className="absolute inset-0 -z-10 rounded bg-ink-700 shadow-sm shadow-black/30"
    />
  );
}
