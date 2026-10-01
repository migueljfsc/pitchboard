/**
 * The sport picker in the top bar: the board's sport as a title, and the others in a
 * panel of line icons under it.
 *
 * A listbox of its own rather than a native select, whose options the platform draws and
 * nobody can put an icon in. It keeps what the select gave for free: arrows move through
 * the options, Enter picks one, Esc and a click anywhere else close it, and focus goes
 * back to the button.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Volleyball } from "lucide-react";
import type { Sport } from "@/board/types";
import { SPORT_IDS } from "@/board/types";
import { cn } from "@/lib/utils";

type Props = {
  value: Sport;
  onChange: (sport: Sport) => void;
  /** A sport's name in the reader's language. */
  nameOf: (sport: Sport) => string;
  label: string;
  hint: string;
  disabled?: boolean;
};

export function SportMenu({ value, onChange, nameOf, label, hint, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    options.current[SPORT_IDS.indexOf(value)]?.focus();
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open, value]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Every key but Tab belongs to the list while it is open: the editor's own shortcuts
    // listen on the window, and an arrow here must not also nudge the selection.
    if (e.key !== "Tab") e.stopPropagation();
    const at = options.current.findIndex((el) => el === document.activeElement);
    const move = (to: number) => {
      e.preventDefault();
      options.current[(to + SPORT_IDS.length) % SPORT_IDS.length]?.focus();
    };
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(SPORT_IDS.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") setOpen(false);
  };

  const pick = (sport: Sport) => {
    close(true);
    onChange(sport);
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${nameOf(value)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${nameOf(value)} — ${hint}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-base font-semibold font-stretch-semi-condensed text-white outline-none transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-transparent"
      >
        <SportIcon sport={value} className="size-[18px] shrink-0 text-ink-200" />
        {nameOf(value)}
        <ChevronDown
          size={14}
          aria-hidden
          className={cn("shrink-0 text-ink-300 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="absolute animate-pop-in origin-top top-full left-0 z-50 mt-1.5 min-w-60 rounded-lg border border-white/5 bg-ink-900 p-1.5 shadow-2xl"
        >
          {SPORT_IDS.map((sport, i) => {
            const chosen = sport === value;
            return (
              <button
                key={sport}
                ref={(el) => {
                  options.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={chosen}
                onClick={() => pick(sport)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-base font-semibold font-stretch-semi-condensed outline-none transition",
                  "hover:bg-white/5 focus-visible:bg-white/5",
                  chosen ? "text-accent" : "text-ink-100 hover:text-white",
                )}
              >
                <SportIcon sport={sport} className={cn("size-6 shrink-0", chosen ? "text-accent" : "text-ink-300")} />
                {nameOf(sport)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Each sport as a line icon, drawn to lucide's grid and weight so they sit beside its icons.
 * Only volleyball is in lucide; the rest are drawn here to match it.
 */
export function SportIcon({ sport, className }: { sport: Sport; className?: string }) {
  if (sport === "volleyball") return <Volleyball aria-hidden strokeWidth={1.6} className={className} />;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {ICONS[sport]}
    </svg>
  );
}

const ICONS: Record<Exclude<Sport, "volleyball">, ReactNode> = {
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.3l3.5 2.5-1.3 4.1H9.8l-1.3-4.1z" />
      <path d="M12 8.3V3.2M15.5 10.8l4.8-1.6M14.2 14.9l3 4.1M9.8 14.9l-3 4.1M8.5 10.8L3.7 9.2" />
    </>
  ),
  futsal: (
    <>
      <circle cx="12" cy="10" r="7" />
      <path d="M12 7.2l2.7 1.9-1 3.2h-3.4l-1-3.2z" />
      <path d="M3 21h18" />
    </>
  ),
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" />
      <path d="M5.6 5.6c3.3 3.4 3.3 9.4 0 12.8M18.4 5.6c-3.3 3.4-3.3 9.4 0 12.8" />
    </>
  ),
  handball: (
    <>
      <circle cx="8.5" cy="4.5" r="1.7" />
      <circle cx="18.5" cy="4.5" r="2" />
      <path d="M4.5 10.5l4-2.5 4 1.5 4-3.2" />
      <path d="M8.5 8l1.3 5.5" />
      <path d="M9.8 13.5l-4 3 1 4.5M9.8 13.5l4.4 2.3-.9 4.7" />
    </>
  ),
  hockey: (
    <>
      <path d="M5 3l9.8 13.6c.8 1.1 2.3 1.4 3.4.7l.8-.5" />
      <path d="M19 3L9.2 16.6c-.8 1.1-2.3 1.4-3.4.7l-.8-.5" />
      <circle cx="12" cy="20.2" r="1.5" />
    </>
  ),
  // One stick with a flat blade, and a puck: told apart from field hockey's crossed sticks and ball.
  icehockey: (
    <>
      <path d="M8 2.5l6.5 15h5.2c.9 0 1.3.8 1 1.5l-.3.5h-7.2" />
      <ellipse cx="6.5" cy="19.5" rx="3.5" ry="1.4" />
    </>
  ),
};
