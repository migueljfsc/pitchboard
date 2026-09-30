/**
 * Signing in, centred over the board rather than hanging off the top bar (D109).
 *
 * It stays until it is dismissed — the backdrop, Escape or the close button — so the "check
 * your email" line a registration ends on is there until the coach has read it.
 */

import { X } from "lucide-react";

import { PasswordForm, type PasswordMode } from "@/components/PasswordForm";
import { useI18n } from "@/i18n/context";
import { Modal } from "@/components/ui/Modal";

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
    <Modal
      onClose={onClose}
      labelledBy="sign-in-title"
      className="max-w-[352px] p-5"
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
    </Modal>
  );
}
