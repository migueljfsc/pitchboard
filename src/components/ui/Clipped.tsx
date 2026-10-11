import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Text kept to one line, cut with an ellipsis where it does not fit. Hovering it shows the whole
 * text, only when it was cut; otherwise the hover falls through to whatever it sits in, such as
 * its button's hint.
 */
export function Clipped({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("truncate", className)}
      onPointerEnter={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? "";
        else el.removeAttribute("title");
      }}
    >
      {children}
    </span>
  );
}
