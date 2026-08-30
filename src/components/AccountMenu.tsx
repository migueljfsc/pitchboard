/**
 * Sign in, and what to do once you have.
 *
 * Accounts are optional (D39), so this is the smallest thing in the top bar and never blocks
 * anything: the board works signed out, and the menu offers rather than demands. While the
 * first `/api/me` is in flight it renders nothing at all — a "Sign in" button that flips to a
 * name a moment later is worse than a gap, because the flip invites a click that lands on the
 * wrong thing.
 *
 * The sign-in failure path arrives as a query parameter rather than a response, because the
 * OAuth callback ends in a redirect and there is no fetch to fail. It is read once and then
 * stripped from the address, so a refresh does not resurrect an old complaint.
 */

import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";

import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { AccountState } from "@/lib/useAccount";
import { startGoogleSignIn } from "@/share/api";

/** Codes the Worker actually emits; anything else is a bug and reads as the generic line. */
const KNOWN_ERRORS = new Set(["access_denied", "invalid_state", "email_unverified"]);

/**
 * Reading and clearing are separate on purpose. A lazy `useState` initializer must be pure —
 * StrictMode may run it twice, and a version that also stripped the parameter would return
 * the error the first time and `null` the second. So the read is pure and the address is
 * tidied by an effect that sets no state.
 */
function readAuthError(): string | null {
  const value = new URLSearchParams(window.location.search).get("auth_error");
  if (!value) return null;
  return KNOWN_ERRORS.has(value) ? value : "unknown";
}

function forgetAuthError(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("auth_error")) return;
  url.searchParams.delete("auth_error");
  // replaceState so the back button does not walk into a failed sign-in, and so the hash —
  // which may carry a shared board (D33) — survives untouched.
  window.history.replaceState(null, "", url.toString());
}

/**
 * The state is passed in rather than hooked here: the editor also needs to know whether
 * anyone is signed in, and two `useAccount()` calls would be two `/api/me` requests that can
 * disagree with each other.
 */
export function AccountMenu({ account, loading, signOut }: AccountState) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(readAuthError);
  const root = useRef<HTMLDivElement>(null);

  useEffect(forgetAuthError, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing until the answer is in — see the note above about the flip.
  if (loading) return <div className="w-[76px] shrink-0" aria-hidden />;

  if (!account) {
    return (
      <div ref={root} className="relative shrink-0">
        <button
          type="button"
          onClick={startGoogleSignIn}
          title={t("account.signIn.why")}
          className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
        >
          <UserRound size={13} />
          {t("account.signIn")}
        </button>

        {authError && (
          <div className="absolute right-0 top-full z-40 mt-1.5 flex w-72 flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40">
            <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
              {t(`account.error.${authError}` as "account.error.unknown")}
            </p>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="self-end rounded border border-ink-600 px-2 py-1 text-[11px] text-ink-300 transition hover:border-accent hover:text-white"
            >
              {t("account.error.dismiss")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const label = account.displayName ?? account.email;

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("account.menu")}
        className={cn(
          "flex max-w-[11rem] items-center gap-1.5 rounded-md border bg-ink-900 px-2.5 py-1.5 text-xs transition",
          open ? "border-accent text-white" : "border-ink-600 text-ink-200 hover:border-accent hover:text-white",
        )}
      >
        <UserRound size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 flex w-64 flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40"
        >
          <div className="px-1 pb-1">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              {t("account.signedInAs")}
            </p>
            {/* The address can be longer than the menu and must not widen it. */}
            <p className="truncate text-[11px] text-ink-200" title={account.email}>
              {account.email}
            </p>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex items-center gap-1.5 rounded border border-ink-600 px-2 py-1.5 text-[11px] text-ink-200 transition hover:border-accent hover:text-white"
          >
            <LogOut size={12} />
            {t("account.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
