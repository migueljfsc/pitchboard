import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** Small muted text on the right of the header, e.g. a count. */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Collapsible sidebar group. Open state is local — it survives re-renders, not reloads. */
export function Section({ title, badge, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-ink-700 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left transition hover:bg-ink-700/40"
      >
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-ink-400 transition-transform", !open && "-rotate-90")}
        />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-ink-200">
          {title}
        </span>
        {badge && <span className="font-mono text-[10px] text-ink-400">{badge}</span>}
      </button>

      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
