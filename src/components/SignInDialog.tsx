/**
 * Signing in, centred over the board rather than hanging off the top bar (D109).
 *
 * It stays until it is dismissed — the backdrop, Escape or the close button — so the "check
 * your email" line a registration ends on is there until the coach has read it.
 */

import { X } from "lucide-react";

import { PasswordForm, type PasswordMode } from "@/components/PasswordForm";
import { useI18n } from "@/i18n/context";

export function SignInDialog({
  initialMode,
  reset,
  onClose,
}: {
  initialMode: PasswordMode;
  reset?: { token: string; email: string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Only a click on the backdrop itself dismisses — not one that started inside the panel
      // and drifted out, which is how a text selection in the email field ends.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        className="w-full max-w-[352px] rounded-lg border border-ink-600 bg-ink-800 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="sign-in-title" className="text-sm font-semibold text-white">
            {t("account.dialog.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("account.dialog.close")}
            className="rounded p-1 text-ink-400 transition hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
        <PasswordForm initialMode={initialMode} reset={reset} />
      </div>
    </div>
  );
}
