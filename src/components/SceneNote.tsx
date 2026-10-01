import { AnimatePresence, motion } from "motion/react";
import { MessageSquareText } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { hasNotes } from "@/board/scenes";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * The note of the scene being played into, under the board.
 *
 * Shown for the whole board once any scene has a note, even on the scenes that have none, so
 * the board does not jump in size every time playback crosses from one to the other. A note
 * fades over to the next as the scene changes.
 */
export function SceneNoteStrip({ doc, index }: { doc: BoardDoc; index: number }) {
  if (!hasNotes(doc)) return null;
  const scene = doc.scenes[index];
  const note = scene?.note?.trim() ?? "";
  return (
    <div className="flex min-h-12 shrink-0 items-start gap-2.5 border-t border-ink-700 bg-ink-800 px-4 py-2.5">
      <MessageSquareText size={14} aria-hidden className="mt-0.5 shrink-0 text-accent" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={scene?.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
          aria-live="polite"
          className="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed text-ink-200"
        >
          {note || <span className="text-ink-500">{scene?.name}</span>}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
