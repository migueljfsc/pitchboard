/**
 * Deleting an account (D110) — the coach's own, or, from /admin, someone else's.
 *
 * Not `ConfirmDialog`: this one waits on the server, can fail, and asks for the account's
 * address to be typed first. Deleting an account takes other people's links down with it, so a
 * reflexive Enter must not be enough. What happens after a success is the caller's: `onDelete`
 * resolves once it is done, and a rejection shows the failure line.
 */

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n/context";

export function DeleteAccountDialog({
  email,
  title,
  message,
  onDelete,
  onCancel,
}: {
  /** The account being deleted — what has to be typed. */
  email: string;
  title: string;
  message: string;
  onDelete: (typed: string) => Promise<void>;
  onCancel: () => void;
}) {
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
      await onDelete(typed);
    } catch {
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
          {title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-300">{message}</p>
        <label className="mt-4 block text-[11px] text-ink-300">
          {/* One key with its placeholder, split only to style the address inside it. */}
          {t("account.delete.typeEmail")
            .split("{email}")
            .flatMap((part, i) =>
              i === 0
                ? [part]
                : [
                    <strong key={i} className="font-semibold text-accent">
                      {email}
                    </strong>,
                    part,
                  ],
            )}
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
