import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { enter, leave } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** Drawn before the title, so a section can be found at a glance. */
  icon?: ReactNode;
  /** Small muted text on the right of the header, e.g. a count. */
  badge?: string;
  defaultOpen?: boolean;
  /**
   * Controlled open state. Pass with `onOpenChange` to drive a section from
   * outside — Selection opens itself when a double-click starts a rename, which
   * it cannot do while the flag is private to this component.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** No padding around the body, for a panel that brings its own. */
  flush?: boolean;
  /** Names the section for the editor's tour to point at. */
  tour?: string;
  children: ReactNode;
};

/** Collapsible sidebar group. Open state is local unless `open` is supplied. */
export function Section({
  title,
  icon,
  badge,
  defaultOpen = true,
  open: controlled,
  onOpenChange,
  flush = false,
  tour,
  children,
}: Props) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = controlled ?? uncontrolled;

  const toggle = () => {
    if (controlled === undefined) setUncontrolled(!open);
    onOpenChange?.(!open);
  };

  return (
    <section data-tour={tour} className="border-b border-ink-700 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="sticky top-0 z-[5] flex w-full items-center gap-2 border-b border-ink-700 bg-ink-900/70 px-3 py-2.5 text-left backdrop-blur transition hover:bg-ink-700/60"
      >
        {/* A chevron in a box of its own: in a long panel the header has to read as a control,
            not as one more line of the panel's own text. Sticky, so it stays in reach. */}
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-ink-700 text-ink-200">
          <ChevronDown
            size={13}
            className={cn("transition-transform duration-200 ease-(--ease-out)", !open && "-rotate-90")}
          />
        </span>
        {icon && <span className={cn("flex shrink-0 items-center", open ? "text-accent" : "text-ink-400")}>{icon}</span>}
        <span className="flex-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-white">
          {title}
        </span>
        {/* One line, shortened if it must: a long lineup name wraps the header otherwise. */}
        {badge && (
          <span title={badge} className="min-w-0 truncate whitespace-nowrap font-mono text-[11px] text-ink-400">
            {badge}
          </span>
        )}
      </button>

      {/* Clipped only while it moves: a popover inside an open section must be free to overhang it. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transition: enter, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden", transition: leave }}
          >
            <div className={flush ? undefined : "px-4 pb-4"}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
