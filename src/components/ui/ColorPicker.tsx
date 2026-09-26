/**
 * One ball showing the colour in use, which opens the palette in a small popover.
 *
 * Every colour on the board comes from `PALETTE`, so an imported kit (snapped to it, D77) can
 * always be picked again and a link matched to it — there is deliberately no free colour
 * input. `none` is the state a row had before a colour was chosen, where it has one: no
 * panel, a link following its kit, no highlight, the team's own kit on the keeper (D107).
 *
 * Closes on a pick, a click anywhere else, Escape, or the page scrolling, as the context menu
 * does; Escape hands focus back to the ball.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PALETTE } from "@/components/ui/palette";
import { cn } from "@/lib/utils";

export type NoColor = {
  /** Its name in the popover, e.g. "Auto" or "Off". */
  label: string;
  title?: string;
  /** What the ball shows while it is chosen: a CSS background, or an icon on the dark. */
  preview?: string;
  icon?: ReactNode;
};

export function ColorPicker({
  value,
  onChange,
  label,
  optionLabel,
  none,
  size = "sm",
  preview,
}: {
  /** A palette colour, or null for `none`. */
  value: string | null;
  onChange: (color: string | null) => void;
  /** The ball's own name, for its title and screen readers. */
  label: string;
  /** Each swatch's name, from its colour. */
  optionLabel: (color: string) => string;
  none?: NoColor;
  size?: "sm" | "md";
  /** What the ball shows instead of a flat `value`, e.g. a striped shirt. */
  preview?: string;
}) {
  // The ball it opened from, which the popover is placed against; null while closed.
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = anchor !== null;
  const empty = value === null;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => setAnchor(open ? null : e.currentTarget)}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full text-ink-400 ring-1 transition",
          size === "sm" ? "size-4" : "size-5",
          open ? "ring-2 ring-accent" : "ring-white/25 hover:ring-white/50",
        )}
        style={{ background: empty ? none?.preview : (preview ?? value) }}
      >
        {empty && !none?.preview && none?.icon}
      </button>
      {anchor && (
        <Palette
          anchor={anchor}
          value={value}
          none={none}
          optionLabel={optionLabel}
          onPick={(color) => {
            setAnchor(null);
            onChange(color);
          }}
          onClose={(refocus) => {
            setAnchor(null);
            if (refocus) anchor.focus();
          }}
        />
      )}
    </>
  );
}

function Palette({
  anchor,
  value,
  none,
  optionLabel,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  value: string | null;
  none?: NoColor;
  optionLabel: (color: string) => string;
  onPick: (color: string | null) => void;
  onClose: (refocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);

  // Under the ball, or above it with no room below; kept inside the window either way.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const { width, height } = el.getBoundingClientRect();
    const below = a.bottom + 6;
    setPlace({
      x: Math.max(8, Math.min(a.left - 6, window.innerWidth - width - 8)),
      y: below + height > window.innerHeight - 8 ? Math.max(8, a.top - 6 - height) : below,
    });
    const current = el.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    (current ?? el.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [anchor]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose(true);
      }
    };
    const gone = () => onClose(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", gone, true);
      window.removeEventListener("resize", gone);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      className="fixed z-50 flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800 p-2 shadow-2xl"
      style={{ left: place?.x ?? 0, top: place?.y ?? 0, visibility: place ? "visible" : "hidden" }}
    >
      {none && (
        <button
          type="button"
          title={none.title}
          aria-pressed={value === null}
          onClick={() => onPick(null)}
          className={cn(
            "flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] transition",
            value === null
              ? "border-accent text-accent"
              : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
          )}
        >
          {(none.preview || none.icon) && (
            <span
              className="flex size-3.5 shrink-0 items-center justify-center rounded-full ring-1 ring-white/25"
              style={{ background: none.preview }}
            >
              {!none.preview && none.icon}
            </span>
          )}
          {none.label}
        </button>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={optionLabel(c)}
            title={optionLabel(c)}
            aria-pressed={value === c}
            onClick={() => onPick(c)}
            className={cn(
              "size-5 rounded-full ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
              value === c
                ? "ring-2 ring-accent ring-offset-1 ring-offset-ink-800"
                : "ring-white/15 hover:ring-white/40",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
