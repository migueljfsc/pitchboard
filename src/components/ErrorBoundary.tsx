/**
 * What the page shows when drawing or editing throws, instead of going blank.
 *
 * The board is safe — it autosaves to this browser — but a white page does not say so. This
 * says so, offers the stored board as a file first, and only then a fresh start, which
 * clears it. Catches what React can: anything thrown while rendering or in an effect, which
 * includes drawing the board.
 */

import { Component, type ReactNode } from "react";
import { useI18n } from "@/i18n/context";
import { storedBoardText } from "@/share/local";

type State = { failed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  render() {
    return this.state.failed ? <Crashed /> : this.props.children;
  }
}

function Crashed() {
  const { t } = useI18n();
  const stored = storedBoardText();

  const download = () => {
    if (!stored) return;
    const url = URL.createObjectURL(new Blob([stored], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "pitchboard-board.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const button =
    "rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white";

  return (
    <div role="alert" className="flex h-full w-full items-center justify-center bg-ink-900 p-6">
      <div className="max-w-md rounded-lg border border-ink-600 bg-ink-800 p-5 shadow-2xl">
        <h1 className="text-sm font-semibold text-white">{t("crash.title")}</h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-300">{t("crash.message")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => window.location.reload()} className={`${button} border-accent text-white`}>
            {t("crash.reload")}
          </button>
          {stored && (
            <button type="button" onClick={download} className={button}>
              {t("crash.download")}
            </button>
          )}
          <button
            type="button"
            title={t("crash.fresh.hint")}
            onClick={() => window.location.assign("/?fresh=1")}
            className={button}
          >
            {t("crash.fresh")}
          </button>
        </div>
      </div>
    </div>
  );
}
