import type { ReactNode } from "react";
import { motion } from "motion/react";
import { enter, leave } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Props = {
  onClose: () => void;
  /** 60 for a confirmation, which can be raised from inside another modal. */
  layer?: 50 | 60;
  /** Where the panel sits: centred, or hung from near the top for a long or growing one. */
  align?: "center" | "top";
  /** Classes for the panel — its width, height and scrolling. */
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  label?: string;
  children: ReactNode;
};

/**
 * The backdrop and panel every dialog shares, fading and rising in, and back out when the
 * caller wraps it in `AnimatePresence`.
 *
 * Only a mousedown on the backdrop itself dismisses — not a press that started inside the
 * panel and drifted out, which is how a text selection in a field ends.
 */
export function Modal({
  onClose,
  layer = 50,
  align = "center",
  className,
  labelledBy,
  describedBy,
  label,
  children,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: enter }}
      exit={{ opacity: 0, transition: leave, pointerEvents: "none" }}
      className={cn(
        "fixed inset-0 flex justify-center bg-black/60 p-4 backdrop-blur-[2px]",
        layer === 60 ? "z-[60]" : "z-50",
        align === "center" ? "items-center" : "items-start pt-[8vh]",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={label}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: enter }}
        exit={{ opacity: 0, scale: 0.98, y: 4, transition: leave }}
        className={cn(
          "w-full rounded-xl border border-ink-600 bg-ink-800 shadow-2xl shadow-black/50 ring-1 ring-white/[0.03]",
          className,
        )}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
