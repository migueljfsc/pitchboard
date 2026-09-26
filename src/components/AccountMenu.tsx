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
 *
 * The emailed links arrive the same way (D109): `?verify=<token>` is spent as soon as the page
 * opens, and `?reset=<token>&email=<address>` opens the menu on a new-password form. Both go
 * to the page, not to the API, because mail scanners follow GET links and would spend the
 * token before the coach ever saw it; only a POST from the page uses it.
 */

import { useEffect, useRef, useState } from "react";
import { LogOut, Trash2, UserRound } from "lucide-react";

import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { PasswordForm } from "@/components/PasswordForm";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";
import { enterSignedIn, errorKey } from "@/lib/signIn";
import { cn } from "@/lib/utils";
import type { AccountState } from "@/lib/useAccount";
import { verifyEmail } from "@/share/api";

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

/** A link from an email, read as purely as `readAuthError` and for the same reason. */
type EmailLink = { verify: string } | { reset: string; email: string };

function readEmailLink(): EmailLink | null {
  const params = new URLSearchParams(window.location.search);
  const verify = params.get("verify");
  if (verify) return { verify };
  const reset = params.get("reset");
  const email = params.get("email");
  if (reset && email) return { reset, email };
  return null;
}

/** Tokens are credentials: out of the address before anything else can copy it. */
const LINK_PARAMS = ["auth_error", "verify", "reset", "email"];

function forgetAuthParams(): void {
  const url = new URL(window.location.href);
  if (!LINK_PARAMS.some((name) => url.searchParams.has(name))) return;
  for (const name of LINK_PARAMS) url.searchParams.delete(name);
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
  const [link] = useState<EmailLink | null>(readEmailLink);
  // A reset link opens straight onto its form; anything else waits for a click.
  const [open, setOpen] = useState(() => link !== null && "reset" in link);
  const [authError, setAuthError] = useState<string | null>(readAuthError);
  const [linkError, setLinkError] = useState<MessageKey | null>(null);
  const [verifying, setVerifying] = useState(() => link !== null && "verify" in link);
  const [deleting, setDeleting] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(forgetAuthParams, []);

  // Spent once. StrictMode's second mount finds the token already deleted by the first and
  // gets `invalid_token`, which is why a success navigates away before anything can render it.
  const verifyToken = link && "verify" in link ? link.verify : null;
  useEffect(() => {
    if (!verifyToken) return;
    let live = true;
    verifyEmail(verifyToken)
      .then(enterSignedIn)
      .catch((cause: unknown) => {
        if (!live) return;
        setLinkError(errorKey(cause));
        setVerifying(false);
      });
    return () => {
      live = false;
    };
  }, [verifyToken]);

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
    const reset = link && "reset" in link ? { token: link.reset, email: link.email } : undefined;
    return (
      <div ref={root} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={t("account.signIn.why")}
          className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
        >
          <UserRound size={13} />
          {t("account.signIn")}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-40 mt-1.5 flex w-[320px] flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40">
            <PasswordForm initialMode={reset ? "reset" : "signIn"} reset={reset} />
          </div>
        )}

        {!open && verifying && (
          <div className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40">
            <p role="status" className="text-[11px] leading-relaxed text-ink-200">
              {t("account.password.verifying")}
            </p>
          </div>
        )}

        {!open && (authError || linkError) && (
          <div className="absolute right-0 top-full z-40 mt-1.5 flex w-72 flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40">
            <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
              {linkError ? t(linkError) : t(`account.error.${authError}` as "account.error.unknown")}
            </p>
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setLinkError(null);
              }}
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

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setDeleting(true);
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-ink-400 transition hover:text-red-300"
          >
            <Trash2 size={12} />
            {t("account.delete")}
          </button>
        </div>
      )}

      {deleting && <DeleteAccountDialog email={account.email} onCancel={() => setDeleting(false)} />}
    </div>
  );
}
