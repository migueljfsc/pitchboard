import { useState } from "react";
import { Check, Link2, TriangleAlert } from "lucide-react";
import type { BoardDoc, PitchView } from "@/board/types";
import { URL_BUDGET, encodeBoard, shareUrl, withinBudget, withoutHash } from "@/share/urlcodec";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

type Props = {
  doc: BoardDoc;
  /** The framing on screen. It travels with the link so a recipient opens the
   *  board cropped the way it was being shown (D35). */
  view: PitchView;
};

type State =
  | { kind: "idle" }
  | { kind: "copied"; chars: number }
  | { kind: "long"; chars: number; url: string }
  /** The clipboard refused, so the link is offered to be copied by hand. */
  | { kind: "manual"; url: string }
  /** No link was produced at all, so there is nothing to fall back to. */
  | { kind: "failed" };

/**
 * The self-contained share link.
 *
 * Everything needed to open the board is in the link, so there is no account, no
 * expiry and nothing to authorise — see D7. It also means the board's size is
 * the link's size, which is why the length is reported rather than hidden: a
 * board heavy with freehand makes a link some chat clients will truncate, and a
 * truncated link fails silently at the far end.
 */
export function SharePanel({ doc, view }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: "idle" });

  const copy = async () => {
    let url: string;
    let payload: string;
    try {
      payload = await encodeBoard(doc);
      url = shareUrl(withoutHash(window.location.href), payload, view);
    } catch {
      setState({ kind: "failed" });
      return;
    }

    if (!withinBudget(payload)) {
      setState({ kind: "long", chars: payload.length, url });
      return;
    }

    await put(url, payload.length);
  };

  /**
   * Copy, or hand the link over to be copied by hand.
   *
   * The clipboard API refuses whenever the document is not focused, which is
   * routine rather than exceptional — a background tab, an embedded frame, a
   * browser with the permission denied. Reporting that and stopping leaves the
   * link unreachable, so the fallback shows it instead.
   */
  const put = async (url: string, chars: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setState({ kind: "copied", chars });
      window.setTimeout(() => setState({ kind: "idle" }), 4000);
    } catch {
      setState({ kind: "manual", url });
    }
  };

  /**
   * The panel lives in the top bar, which is a fixed-height row: anything it has
   * to say hangs beneath the button rather than growing the bar. Copying is the
   * ordinary path and says nothing at all, so the dropdown is rare.
   */
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => void copy()}
        title={t("share.title")}
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-ink-900 px-2.5 py-1.5 text-xs transition",
          state.kind === "copied"
            ? "border-accent text-accent"
            : "border-ink-600 text-ink-200 hover:border-accent hover:text-white",
        )}
      >
        {state.kind === "copied" ? <Check size={13} /> : <Link2 size={13} />}
        {t(state.kind === "copied" ? "share.copied" : "share.copy")}
      </button>

      {(state.kind === "long" || state.kind === "failed" || state.kind === "manual") && (
        <div className="absolute right-0 top-full z-40 mt-1.5 flex w-80 flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-lg shadow-black/40">
          {state.kind === "long" && (
            <div
              className="flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1.5"
              title={t("share.long.title", {
                chars: state.chars.toLocaleString(),
                budget: URL_BUDGET.toLocaleString(),
              })}
            >
              <TriangleAlert size={13} className="shrink-0 text-amber-300" />
              <span className="text-[11px] leading-tight text-amber-200">
                {t("share.long", { chars: state.chars.toLocaleString() })}
              </span>
              <button
                type="button"
                onClick={() => void put(state.url, state.chars)}
                className="ml-auto shrink-0 text-[11px] text-amber-200 underline underline-offset-2 hover:text-white"
              >
                {t("share.anyway")}
              </button>
            </div>
          )}

          {state.kind === "failed" && (
            <p role="alert" className="text-[11px] leading-relaxed text-red-300">
              {t("share.failed")}
            </p>
          )}

          {state.kind === "manual" && (
            <div className="flex flex-col gap-1">
              <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
                {t("share.manual")}
              </p>
              <input
                readOnly
                value={state.url}
                aria-label={t("share.copy")}
                onFocus={(e) => e.currentTarget.select()}
                ref={(el) => el?.select()}
                className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-200 outline-none focus:border-accent"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
