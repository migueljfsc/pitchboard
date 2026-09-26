/**
 * Cloudflare Turnstile, on the forms that make the Worker send an email (D109).
 *
 * The script is loaded on first use rather than from index.html, so a visitor who never opens
 * the register or reset form never fetches it — the board itself makes no third-party request.
 *
 * The site key is public by nature: it is rendered into the page. It comes from
 * `tofu output turnstile_sitekey`. In development it is Cloudflare's always-pass test key, which
 * the production secret rejects, so a dev build pointed at production fails closed.
 */

import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.DEV ? "1x00000000000000000000AA" : "0x4AAAAAAFEfzyePULx0c_oO";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      theme?: "dark" | "light" | "auto";
      language?: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Reports a token, or null whenever the last one expired or the challenge failed. */
export function Turnstile({ onToken, language }: { onToken: (token: string | null) => void; language: string }) {
  const host = useRef<HTMLDivElement>(null);
  // The widget is rendered once per mount; a changing callback must not re-render it and
  // throw away a token the coach already earned.
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let id: string | null = null;
    let live = true;
    void loadTurnstile()
      .then((api) => {
        if (!live || !host.current) return;
        id = api.render(host.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          language,
          callback: (token) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      live = false;
      if (id !== null) window.turnstile?.remove(id);
    };
  }, [language]);

  return <div ref={host} className="min-h-[65px]" />;
}
