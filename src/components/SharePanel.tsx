import { useState } from "react";
import { Check, Link2, TriangleAlert } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { URL_BUDGET, encodeBoard, shareUrl, withinBudget, withoutHash } from "@/share/urlcodec";
import { cn } from "@/lib/utils";

type Props = { doc: BoardDoc };

type State =
  | { kind: "idle" }
  | { kind: "copied"; chars: number }
  | { kind: "long"; chars: number; url: string }
  /** The clipboard refused, so the link is offered to be copied by hand. */
  | { kind: "manual"; url: string }
  /** No link was produced at all, so there is nothing to fall back to. */
  | { kind: "failed"; message: string };

/**
 * The self-contained share link.
 *
 * Everything needed to open the board is in the link, so there is no account, no
 * expiry and nothing to authorise — see D7. It also means the board's size is
 * the link's size, which is why the length is reported rather than hidden: a
 * board heavy with freehand makes a link some chat clients will truncate, and a
 * truncated link fails silently at the far end.
 */
export function SharePanel({ doc }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const copy = async () => {
    let url: string;
    let payload: string;
    try {
      payload = await encodeBoard(doc);
      url = shareUrl(withoutHash(window.location.href), payload);
    } catch {
      setState({ kind: "failed", message: "This browser could not compress the board." });
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

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-md border bg-ink-900 px-2 py-1.5 text-xs transition",
          state.kind === "copied"
            ? "border-accent text-accent"
            : "border-ink-600 text-ink-200 hover:border-accent hover:text-white",
        )}
      >
        {state.kind === "copied" ? <Check size={13} /> : <Link2 size={13} />}
        {state.kind === "copied" ? "Link copied" : "Copy share link"}
      </button>

      {state.kind === "long" && (
        <div
          className="flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1.5"
          title={`This link is ${state.chars.toLocaleString()} characters, past the ${URL_BUDGET.toLocaleString()} that survives most chat apps and mail. Anything that cuts it short produces a link that opens as damaged rather than as an error. Freehand drawing is almost always the cause — export the JSON instead, or simplify the drawing.`}
        >
          <TriangleAlert size={13} className="shrink-0 text-amber-300" />
          <span className="text-[11px] leading-tight text-amber-200">
            {state.chars.toLocaleString()} chars — too long to paste safely
          </span>
          <button
            type="button"
            onClick={() => void put(state.url, state.chars)}
            className="ml-auto shrink-0 text-[11px] text-amber-200 underline underline-offset-2 hover:text-white"
          >
            Anyway
          </button>
        </div>
      )}

      {state.kind === "failed" && (
        <p role="alert" className="text-[11px] leading-relaxed text-red-300">
          {state.message}
        </p>
      )}

      {state.kind === "manual" && (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
            The browser would not reach the clipboard — copy the link by hand.
          </p>
          <input
            readOnly
            value={state.url}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            ref={(el) => el?.select()}
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-200 outline-none focus:border-accent"
          />
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-300">
        The whole board travels in the link, so it never expires. Whoever opens it watches a
        read-only copy and can fork their own.
      </p>
    </>
  );
}
