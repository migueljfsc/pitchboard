import { X } from "lucide-react";
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
  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-1.5 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-md border border-ink-600 bg-ink-800/95 px-3 py-2 text-xs text-ink-200 shadow-lg backdrop-blur"
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
        </div>
      ))}
    </div>
  );
}
