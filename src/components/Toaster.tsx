import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { leave, spring } from "@/lib/motion";
import type { Toast } from "@/lib/useToasts";
import { useI18n } from "@/i18n/context";

/**
 * The notices, stacked over the top of the board.
 *
 * Absolutely placed inside the board's own box rather than fixed to the window,
 * so they never sit over a panel and never cover the timeline's controls.
 */
export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-1.5 px-4"
    >
      <AnimatePresence initial={false}>
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          layout
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: leave }}
          transition={spring}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-ink-600 bg-ink-800/95 px-3 py-2 text-xs text-ink-200 shadow-xl shadow-black/40 backdrop-blur"
        >
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                onDismiss(toast.id);
              }}
              className="shrink-0 font-medium text-accent transition hover:brightness-110"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label={t("toast.dismiss")}
            className="shrink-0 text-ink-400 transition hover:text-white"
          >
            <X size={13} />
          </button>
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
  );
}
