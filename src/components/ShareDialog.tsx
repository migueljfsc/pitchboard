/**
 * Every way of handing a board to someone, in one place.
 *
 * Two of them, and they are genuinely different things rather than two buttons for the
 * same one — which is why they were worth collecting rather than merging:
 *
 *   LINK   the whole board deflated into a `#d=` fragment. Frozen by construction, never
 *          expires, needs no account, and never reaches a server at all — browsers do not
 *          send a fragment (D33). Its size is the board's size, which is why the length is
 *          reported rather than hidden: a link some chat client truncates fails silently at
 *          the far end.
 *   BOARD  `/s/<slug>`, a live pointer at a saved board. Reloading it shows whatever the
 *          owner has changed since. Short enough to read down a phone, and it lasts exactly
 *          as long as the board does.
 *
 * Read together: the first is permanent and frozen, the second is live and revocable.
 *
 * There was a third here — JSON, in and out — and it was two things wearing one label. A
 * file coming OUT is a format the board is written in, so it sits in the export dialog
 * beside MP4 and PNG (`JsonPane`); a file going IN is not a way of handing the board to
 * anyone at all, so it has its own button and its own dialog (`ImportDialog`).
 */

import { useEffect, useState } from "react";
import { Check, Copy, Link2, TriangleAlert, X } from "lucide-react";

import type { BoardDoc, PitchView } from "@/board/types";
import { Action, Toggle } from "@/components/ui/DialogControls";
import { useI18n } from "@/i18n/context";
import type { CloudBoard } from "@/lib/useCloudBoard";
import { ApiError, publishBoard, shareUrl as boardShareUrl, unpublishBoard } from "@/share/api";
import { URL_BUDGET, encodeBoard, shareUrl, withinBudget, withoutHash } from "@/share/urlcodec";

type Method = "board" | "link";

type LinkState =
  | { kind: "idle" }
  | { kind: "copied"; chars: number }
  | { kind: "long"; chars: number; url: string }
  /** The clipboard refused, so the link is offered to be copied by hand. */
  | { kind: "manual"; url: string }
  /** No link was produced at all, so there is nothing to fall back to. */
  | { kind: "failed" };

type Props = {
  doc: BoardDoc;
  /** The framing on screen. It travels with the anonymous link so a recipient opens the
   *  board cropped the way it was being shown (D35). */
  view: PitchView;
  cloud: CloudBoard;
  signedIn: boolean;
  onClose: () => void;
  /** A confirmation is up over this dialog, and owns the keyboard. */
  blocked?: boolean;
};

export function ShareDialog({ doc, view, cloud, signedIn, onClose, blocked }: Props) {
  const { t } = useI18n();
  /**
   * The board link leads, because it is the one most people want: short, revocable, and it
   * stays current. It only leads when it can actually be used, though — opening on a pane
   * that says "sign in first" would make the default advice rather than an action, so a
   * signed-out visitor lands on the link that works for them.
   */
  const [method, setMethod] = useState<Method>(signedIn ? "board" : "link");
  const [link, setLink] = useState<LinkState>({ kind: "idle" });
  const [slug, setSlug] = useState<string | null>(null);
  const [boardCopied, setBoardCopied] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  useEffect(() => {
    // While a confirmation is up, Escape belongs to it. Both listeners are on the window, so
    // the only reliable way to stay out of its way is not to listen at all.
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, blocked]);

  // --- the self-contained link ---

  const put = async (url: string, chars: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setLink({ kind: "copied", chars });
    } catch {
      setLink({ kind: "manual", url });
    }
  };

  const copyLink = async () => {
    let url: string;
    let payload: string;
    try {
      payload = await encodeBoard(doc);
      url = shareUrl(withoutHash(window.location.href), payload, view);
    } catch {
      setLink({ kind: "failed" });
      return;
    }
    if (!withinBudget(payload)) {
      setLink({ kind: "long", chars: payload.length, url });
      return;
    }
    await put(url, payload.length);
  };

  // --- the live board link ---

  const copyBoardLink = async () => {
    if (!cloud.board) return;
    try {
      const minted = await publishBoard(cloud.board.id);
      setSlug(minted);
      await navigator.clipboard.writeText(boardShareUrl(minted)).catch(() => undefined);
      setBoardCopied(true);
      window.setTimeout(() => setBoardCopied(false), 4000);
      setBoardError(null);
    } catch (error) {
      setBoardError(error instanceof ApiError ? error.code : "unknown");
    }
  };

  const withdraw = async () => {
    if (!cloud.board) return;
    try {
      await unpublishBoard(cloud.board.id);
      setSlug(null);
      setBoardError(null);
    } catch (error) {
      setBoardError(error instanceof ApiError ? error.code : "unknown");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="share-title" className="text-sm font-semibold text-white">
            {t("share.dialog.title")}
          </h2>
          <div className="flex gap-1">
            <Toggle active={method === "board"} onClick={() => setMethod("board")}>
              {t("share.method.board")}
            </Toggle>
            <Toggle active={method === "link"} onClick={() => setMethod("link")}>
              {t("share.method.link")}
            </Toggle>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("share.close")}
            className="ml-auto flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {method === "board" && (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[11px] leading-relaxed text-ink-300">{t("share.board.blurb")}</p>

            {/* The two things that have to be true before there is anything to point at. */}
            {!signedIn ? (
              <p className="text-[11px] leading-relaxed text-amber-200">
                {t("share.board.needsAccount")}
              </p>
            ) : !cloud.board ? (
              <p className="text-[11px] leading-relaxed text-amber-200">
                {t("share.board.needsSaving")}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Action
                    onClick={() => void copyBoardLink()}
                    icon={boardCopied ? Check : Link2}
                    primary
                  >
                    {t(boardCopied ? "share.board.copied" : "share.board.copy")}
                  </Action>
                  {slug && (
                    <Action onClick={() => void withdraw()} icon={X}>
                      {t("share.board.withdraw")}
                    </Action>
                  )}
                </div>

                {slug && (
                  <input
                    readOnly
                    value={boardShareUrl(slug)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={t("share.board.copy")}
                    className="rounded border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-[11px] text-ink-300 outline-none"
                  />
                )}

                {boardError && (
                  <p role="alert" className="text-[11px] text-red-300">
                    {t(`boards.error.${boardError}` as "boards.error.unknown")}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {method === "link" && (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[11px] leading-relaxed text-ink-300">{t("share.link.blurb")}</p>

            <div className="flex items-center gap-2">
              <Action onClick={() => void copyLink()} icon={link.kind === "copied" ? Check : Link2} primary>
                {t(link.kind === "copied" ? "share.copied" : "share.copy")}
              </Action>
              {link.kind === "copied" && (
                <span className="text-[11px] text-ink-400">
                  {t("share.length", { chars: link.chars, budget: URL_BUDGET })}
                </span>
              )}
            </div>

            {link.kind === "long" && (
              <div className="flex flex-col gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 p-2">
                <p className="flex items-center gap-1.5 text-[11px] text-amber-200">
                  <TriangleAlert size={12} className="shrink-0" />
                  {t("share.long", { chars: link.chars })}
                </p>
                <p className="text-[11px] leading-relaxed text-amber-200/80">
                  {t("share.long.title")}
                </p>
                <Action onClick={() => void put(link.url, link.chars)} icon={Copy}>
                  {t("share.anyway")}
                </Action>
              </div>
            )}

            {link.kind === "failed" && (
              <p role="alert" className="text-[11px] text-red-300">
                {t("share.failed")}
              </p>
            )}

            {link.kind === "manual" && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] text-amber-200">{t("share.manual")}</p>
                <textarea
                  readOnly
                  value={link.url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t("share.copy")}
                  className="resize-none rounded border border-ink-600 bg-ink-900 p-2 font-mono text-[11px] text-ink-300 outline-none"
                  rows={3}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
