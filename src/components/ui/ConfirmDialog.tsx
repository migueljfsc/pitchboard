import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/context";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A small modal confirmation.
 *
 * Deliberately not window.confirm: it cannot be styled, it blocks the whole
 * thread, and in an automated browser it wedges the page until someone dismisses
 * it by hand.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      // Above every other modal: a confirmation is always the more urgent of
      // the two, and it can be raised from inside one.
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      // Only a click on the backdrop itself dismisses — not one that started
      // inside the panel and drifted out.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-lg border border-ink-600 bg-ink-800 p-5 shadow-2xl"
      >
        <h2 id="confirm-title" className="text-sm font-semibold text-white">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-xs leading-relaxed text-ink-300">
          {message}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 transition hover:border-ink-400 hover:text-white"
          >
            {t("confirm.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
