import { cn } from "@/lib/utils";

/**
 * The mark: a pitch seen from above with a run curving across it — the board's two ideas,
 * a place and a movement, in one glyph.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--color-accent)" />
      <rect x="6" y="8" width="20" height="16" rx="2" fill="none" stroke="#0e1f17" strokeWidth="1.6" opacity="0.35" />
      <line x1="16" y1="8" x2="16" y2="24" stroke="#0e1f17" strokeWidth="1.6" opacity="0.35" />
      <path d="M9 20 C 12 11, 18 11, 23 13" fill="none" stroke="#0e1f17" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="9" cy="20" r="2.4" fill="#0e1f17" />
      <path d="M23 13 l-3.4 -1.6 M23 13 l-2.2 3" stroke="#0e1f17" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-sm font-semibold tracking-tight text-white">{name}</span>
    </span>
  );
}
