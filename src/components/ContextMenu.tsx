/**
 * A small floating menu at a point on the page — the board's right-click, and the
 * template picker.
 *
 * It owns nothing: the caller builds the items, each closing over what it needs.
 * Closes on a choice, a click anywhere else, Escape, or the page scrolling.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Takes something away; drawn in red. */
      danger?: boolean;
      /** Why it is disabled, or what it does. */
      title?: string;
    }
  | "divider";

export function ContextMenu({
  items,
  at,
  above = false,
  onClose,
}: {
  items: MenuItem[];
  /** Page coordinates of the top-left corner, before it is kept on screen. */
  at: { x: number; y: number };
  /** Open upwards: `at` is the BOTTOM-left corner — for a button near the foot of the page. */
  above?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(at);

  // Nudged back on screen once its size is known: a menu opened near the right or
  // bottom edge would otherwise hang off it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPlace({
      x: Math.min(at.x, window.innerWidth - width - 8),
      y: above ? Math.max(8, at.y - height) : Math.min(at.y, window.innerHeight - height - 8),
    });
    // Re-measured when the items change: a menu filled in after it opened — the
    // account's templates arrive late — grows, and one opened upwards must grow up.
  }, [at, above, items.length]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Leading and trailing dividers, and runs of them, come from items that were
  // left out; they are dropped rather than drawn as empty rules.
  const shown = items.filter(
    (item, i, all) =>
      item !== "divider" || (i > 0 && i < all.length - 1 && all[i - 1] !== "divider"),
  );

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-48 overflow-hidden rounded-md border border-ink-600 bg-ink-800 py-1 shadow-2xl"
      style={{ left: place.x, top: place.y }}
    >
      {shown.map((item, i) =>
        item === "divider" ? (
          <div key={`d${i}`} className="my-1 h-px bg-ink-700" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              "block w-full px-3 py-1.5 text-left text-xs transition disabled:opacity-40",
              item.danger
                ? "text-red-300 enabled:hover:bg-red-500/15"
                : "text-ink-200 enabled:hover:bg-ink-700 enabled:hover:text-white",
            )}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
