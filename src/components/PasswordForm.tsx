/**
 * Email and password: sign in, register, forgot, and the reset a link opens (D109).
 *
 * The password never leaves this component. `deriveKey` turns it into the key the Worker sees,
 * which takes a few hundred milliseconds on a phone — hence the busy state on every submit.
 */

import { useState } from "react";

import { Turnstile } from "@/components/Turnstile";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";
import { enterSignedIn, errorKey } from "@/lib/signIn";
import {
  registerWithPassword,
  requestPasswordReset,
  resetPassword,
  signInWithPassword,
  startGoogleSignIn,
} from "@/share/api";
import { deriveKey, MIN_PASSWORD } from "@/share/password";

export type PasswordMode = "signIn" | "register" | "forgot" | "reset";

/**
 * Google's "G", in the four colours its sign-in branding guidelines require. Inline because
 * lucide ships no brand marks, and a sign-in button is one of the uses Google permits.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width={14} height={14} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const INPUT =
  "w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-white outline-none placeholder:text-ink-400 focus:border-accent";
const PRIMARY =
  "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110 disabled:opacity-50";
const LINK = "text-[11px] text-ink-300 underline-offset-2 transition hover:text-white hover:underline";

export function PasswordForm({
  initialMode = "signIn",
  reset,
}: {
  initialMode?: PasswordMode;
  /** From a reset link: the token, and the address it was sent to. */
  reset?: { token: string; email: string };
}) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<PasswordMode>(initialMode);
  const [email, setEmail] = useState(reset?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  /** What was sent, and to whom, once a register or forgot has gone through. */
  const [sent, setSent] = useState<{ key: MessageKey; email: string } | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  // A Turnstile token is single use. Bumping this remounts the widget for a fresh one.
  const [challenge, setChallenge] = useState(0);

  const needsCaptcha = mode === "register" || mode === "forgot";
  const needsPassword = mode !== "forgot";
  const newPassword = mode === "register" || mode === "reset";

  const go = (next: PasswordMode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setCaptcha(null);
  };

  const submit = async () => {
    if (busy) return;
    if (newPassword && password.length < MIN_PASSWORD) {
      setError("account.password.tooShort");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "signIn") {
        await signInWithPassword(email, await deriveKey(email, password));
        enterSignedIn();
        return;
      }
      if (mode === "reset" && reset) {
        await resetPassword(reset.token, reset.email, await deriveKey(reset.email, password));
        enterSignedIn();
        return;
      }
      if (mode === "register") {
        await registerWithPassword(email, await deriveKey(email, password), captcha ?? "", locale);
        setSent({ key: "account.password.sentVerify", email });
      } else if (mode === "forgot") {
        await requestPasswordReset(email, captcha ?? "", locale);
        setSent({ key: "account.password.sentReset", email });
      }
    } catch (cause) {
      setError(errorKey(cause));
      setCaptcha(null);
      setChallenge((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="text-[11px] leading-relaxed text-ink-200">
        {t(sent.key, { email: sent.email })}
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {(mode === "signIn" || mode === "register") && (
        <>
          <button
            type="button"
            onClick={startGoogleSignIn}
            className="flex items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
          >
            <GoogleMark />
            {t("account.signIn.google")}
          </button>
          <p className="text-center text-[11px] text-ink-400">
            {t("account.signIn.or")}
          </p>
        </>
      )}

      {mode === "reset" && (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {t("account.password.resetFor", { email: reset?.email ?? "" })}
        </p>
      )}

      {mode !== "reset" && (
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("account.email")}
          aria-label={t("account.email")}
          className={INPUT}
        />
      )}

      {needsPassword && (
        <input
          type="password"
          required
          autoComplete={newPassword ? "new-password" : "current-password"}
          minLength={newPassword ? MIN_PASSWORD : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t(newPassword ? "account.password.new" : "account.password")}
          aria-label={t(newPassword ? "account.password.new" : "account.password")}
          className={INPUT}
        />
      )}

      {needsCaptcha && <Turnstile key={challenge} language={locale} onToken={setCaptcha} />}

      {error && (
        <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
          {t(error, { min: MIN_PASSWORD })}
        </p>
      )}

      <button type="submit" disabled={busy || (needsCaptcha && !captcha)} className={PRIMARY}>
        {busy ? t("account.password.busy") : t(`account.password.submit.${mode}`)}
      </button>

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
        {mode === "signIn" && (
          <>
            <button type="button" onClick={() => go("register")} className={LINK}>
              {t("account.password.toRegister")}
            </button>
            <button type="button" onClick={() => go("forgot")} className={LINK}>
              {t("account.password.toForgot")}
            </button>
          </>
        )}
        {(mode === "register" || mode === "forgot") && (
          <button type="button" onClick={() => go("signIn")} className={LINK}>
            {t("account.password.toSignIn")}
          </button>
        )}
      </div>
    </form>
  );
}
