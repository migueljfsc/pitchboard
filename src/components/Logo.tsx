import { cn } from "@/lib/utils";

/**
 * The mark: a pitch seen from above with a run curving across it — the board's two ideas,
 * a place and a movement, in one glyph. A green court on a chalk tile, the player setting off
 * in the home side's amber. `public/favicon.svg` is the same drawing and changes with it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--color-accent)" />
      <rect x="4" y="6" width="24" height="20" rx="2.5" fill="#1c6b3c" />
      <rect x="6.5" y="8.5" width="19" height="15" rx="0.5" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.55" />
      <line x1="16" y1="8.5" x2="16" y2="23.5" stroke="#ffffff" strokeWidth="1.2" opacity="0.55" />
      <path d="M10 20 C 12.5 12, 17.5 12, 22 13.5" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 13.5 l-3.2 -1.5 M22 13.5 l-2 2.8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="20" r="2.4" fill="#f59e0b" stroke="#0e1f17" strokeWidth="0.8" />
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
