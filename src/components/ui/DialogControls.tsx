/**
 * The two controls every dialog in here needs: a segmented toggle and an action button.
 *
 * Lifted out of JsonDialog when the share dialog grew a second set of them. They were always
 * generic; they were only local because nothing else had asked yet.
 */

import type { Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded border px-2 py-1 text-[11px] transition",
        active
          ? "border-accent text-accent"
          : "border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-200",
      )}
    >
      {children}
    </button>
  );
}

export function Action({
  onClick,
  icon: Icon,
  primary,
  disabled,
  children,
}: {
  onClick: () => void;
  icon: typeof Copy;
  primary?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition disabled:opacity-45",
        primary
          ? "bg-accent font-medium text-ink-900 enabled:hover:brightness-110"
          : "border border-ink-600 text-ink-200 enabled:hover:border-ink-400 enabled:hover:text-white",
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  );
}
