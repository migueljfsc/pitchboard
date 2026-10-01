import { AnimatePresence, motion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Play and pause in one round button, the icon turning over between them, glowing while it plays. */
export function PlayButton({
  playing,
  onToggle,
  label,
}: {
  playing: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-ink-900 transition hover:brightness-110",
        playing && "shadow-[0_0_0_4px_rgb(251_191_36/0.18),0_0_18px_rgb(251_191_36/0.35)]",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          initial={{ scale: 0.3, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0, rotate: 90 }}
          transition={spring}
          className="flex"
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
