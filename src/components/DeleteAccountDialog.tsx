/**
 * Deleting the account (D110).
 *
 * Not `ConfirmDialog`: this one waits on the server, can fail, and asks the coach to type their
 * address first. That is the one irreversible action in the app that takes other people's
 * links down with it, so a reflexive Enter must not be enough.
 *
 * On success it navigates to `/?fresh=1`, the same exit as signing out, so the board the coach
 * had open — possibly one that no longer exists — is not autosaved back into this browser.
 */

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n/context";
import { ApiError, deleteAccount } from "@/share/api";

export function DeleteAccountDialog({ email, onCancel }: { email: string; onCancel: () => void }) {
  const { t } = useI18n();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const submit = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await deleteAccount(typed);
      window.location.assign("/?fresh=1");
    } catch (error) {
      // Already gone, from another tab: the outcome the coach asked for.
      if (error instanceof ApiError && error.status === 401) {
        window.location.assign("/?fresh=1");
        return;
      }
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-sm rounded-lg border border-ink-600 bg-ink-800 p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="delete-account-title" className="text-sm font-semibold text-white">
          {t("account.delete.title")}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-300">{t("account.delete.message")}</p>
        <label className="mt-4 block text-[11px] text-ink-300">
          {t("account.delete.typeEmail", { email })}
          <input
            ref={input}
            type="email"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1.5 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-white outline-none focus:border-red-400"
          />
        </label>

        {failed && (
          <p role="alert" className="mt-3 text-[11px] leading-relaxed text-amber-200">
            {t("account.delete.failed")}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 transition hover:border-ink-400 hover:text-white disabled:opacity-50"
          >
            {t("confirm.cancel")}
          </button>
          <button
            type="submit"
            disabled={!matches || busy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40 disabled:hover:bg-red-600"
          >
            {busy ? t("account.delete.busy") : t("account.delete.confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
