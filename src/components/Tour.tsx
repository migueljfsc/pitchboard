/**
 * The editor's tour: one card per thing that is hard to find or easy to misread.
 *
 * A card may point at the part of the editor it is about, named by a `data-tour`
 * attribute on that element. When the element is on screen it is ringed and the
 * card sits beside it; when it is not — a narrow window, a panel that is not
 * rendered — the card sits in the middle instead, so a missing anchor costs the
 * pointer and never the card.
 *
 * Closing it at any step counts as having seen it. The backdrop does not close
 * it: seen is for good, and a stray click is not a decision.
 *
 * The step is the editor's, not this component's: each card also sets the editor
 * up — a panel opened, a player selected — and the ring has to be measured in the
 * same commit that opens what it rings.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOUR_STEPS } from "@/formations/tour";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { markTourSeen } from "@/share/tour";
import { useI18n } from "@/i18n/context";
import { MODIFIER } from "@/lib/platform";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { cn } from "@/lib/utils";

type Box = { top: number; left: number; width: number; height: number };

/** Space kept between the card and the viewport edge, and the ring and its element. */
const MARGIN = 12;
const GAP = 14;
const RING = 4;

/** The part of an element that is on screen, or null if none of it is. */
function visibleBox(r: DOMRect, vw: number, vh: number): Box | null {
  const left = Math.max(r.left, MARGIN);
  const top = Math.max(r.top, MARGIN);
  const right = Math.min(r.right, vw - MARGIN);
  const bottom = Math.min(r.bottom, vh - MARGIN);
  if (right - left < 1 || bottom - top < 1) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Where the card goes: beside the anchor, on whichever side has the most room left
 * once the card is in it — a sidebar panel takes it to its right, a header button
 * below, the timeline above. Room is counted in card-widths across and card-heights
 * down, and beside is only offered for an anchor at least half the card's height:
 * next to a header button the card would hang over the whole row either side of it.
 *
 * An anchor with room on no side — the board itself — takes the card in its bottom
 * left corner. That is the attacking side's own half on every board the tour shows,
 * where nothing a card is about happens; the middle would sit on the play.
 */
function placeCard(anchor: Box | null, w: number, h: number, vw: number, vh: number) {
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - w - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - h - MARGIN);
  if (!anchor) return { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) };

  const { left, top, width, height } = anchor;
  const right = left + width;
  const bottom = top + height;
  const midX = clampX(left + width / 2 - w / 2);
  const midY = clampY(top + height / 2 - h / 2);

  const beside = height >= h / 2;
  const sides = [
    { room: beside ? (vw - right - GAP - MARGIN) / w : 0, at: { left: right + GAP, top: midY } },
    { room: beside ? (left - GAP - MARGIN) / w : 0, at: { left: left - GAP - w, top: midY } },
    { room: (vh - bottom - GAP - MARGIN) / h, at: { left: midX, top: bottom + GAP } },
    { room: (top - GAP - MARGIN) / h, at: { left: midX, top: top - GAP - h } },
  ].filter((s) => s.room >= 1);
  if (sides.length === 0) return { left: clampX(left + GAP), top: clampY(bottom - GAP - h) };
  return sides.reduce((a, b) => (b.room > a.room ? b : a)).at;
}

export function Tour({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [ring, setRing] = useState<Box | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const current: { id: (typeof TOUR_STEPS)[number]["id"]; anchor?: string } = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  const close = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);
  const next = useCallback(() => (last ? close() : onStep(step + 1)), [last, close, onStep, step]);
  const back = useCallback(() => onStep(Math.max(0, step - 1)), [onStep, step]);

  // Measured after the card has rendered this step's text, and before paint, so it
  // never shows at the last step's size in the last step's place. A change of
  // language resizes the card too, so it is measured again for that.
  useLayoutEffect(() => {
    const el = current.anchor
      ? document.querySelector<HTMLElement>(`[data-tour="${current.anchor}"]`)
      : null;
    el?.scrollIntoView({ block: "nearest" });

    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const box = el ? visibleBox(el.getBoundingClientRect(), vw, vh) : null;
      setRing(box);
      const card = cardRef.current;
      if (card) setAt(placeCard(box, card.offsetWidth, card.offsetHeight, vw, vh));
    };
    // The drawing rail slides open rather than appearing, so the first measure
    // catches it narrow; measure again once anything outside the tour settles.
    const settled = (e: TransitionEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) measure();
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("transitionend", settled, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("transitionend", settled, true);
    };
  }, [current, locale]);

  useEffect(() => nextRef.current?.focus(), [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, next, back]);

  const vars = {
    mod: MODIFIER.replace("+", ""),
    palette: `${MODIFIER}K`,
    undo: `${MODIFIER}Z`,
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-50">
      {ring ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-accent transition-all duration-200"
          style={{
            left: ring.left - RING,
            top: ring.top - RING,
            width: ring.width + RING * 2,
            height: ring.height + RING * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="fixed flex w-[22rem] max-w-[calc(100vw-24px)] flex-col rounded-lg border border-ink-600 bg-ink-800 shadow-2xl transition-[left,top] duration-200"
        style={at ?? { left: 0, top: 0, visibility: "hidden" }}
      >
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <span className="font-mono text-[11px] text-ink-400">
            {t("tour.progress", { n: step + 1, total: TOUR_STEPS.length })}
          </span>
          <div className="flex gap-1" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "size-1.5 rounded-full transition",
                  i === step ? "bg-accent" : "bg-ink-600",
                )}
              />
            ))}
          </div>
          {/* In the card because the header's switch is behind the backdrop until
              the tour is closed, and the tour is what a new reader meets first. */}
          <div className="ml-auto">
            <LocaleSwitch />
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("tour.close")}
            title={t("tour.close")}
            className="flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 pb-4 pt-1">
          <h2 id="tour-title" className="text-sm font-semibold text-white">
            {t(`tour.${current.id}.title`, vars)}
          </h2>
          <div id="tour-body" className="flex flex-col gap-2">
            {t(`tour.${current.id}.body`, vars)
              .split("\n")
              .map((line, i) => (
                <p key={i} className="text-xs leading-relaxed text-ink-300">
                  {line}
                </p>
              ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 whitespace-nowrap border-t border-ink-700 px-4 py-2.5">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-1 rounded-md border border-ink-600 px-2.5 py-1.5 text-xs text-ink-200 transition hover:border-ink-400 hover:text-white"
            >
              <ArrowLeft size={12} />
              {t("tour.back")}
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="rounded-md px-2.5 py-1.5 text-xs text-ink-400 transition hover:text-white"
            >
              {t("tour.skip")}
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110"
          >
            {t(last ? "tour.done" : "tour.next")}
            {!last && <ArrowRight size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
