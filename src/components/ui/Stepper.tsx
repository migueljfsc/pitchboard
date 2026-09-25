import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Up and down, stacked, for the side of a number field — the spinner a text field
 * does not have. `NumberField` is a text input for the sake of the decimal
 * separator, so the browser's own arrows went with the number type.
 */
export function Stepper({
  onUp,
  onDown,
  upLabel,
  downLabel,
  upDisabled = false,
  downDisabled = false,
  className,
}: {
  onUp: () => void;
  onDown: () => void;
  upLabel: string;
  downLabel: string;
  upDisabled?: boolean;
  downDisabled?: boolean;
  className?: string;
}) {
  const button =
    "flex h-1/2 w-4 items-center justify-center text-ink-400 transition enabled:hover:bg-ink-700 enabled:hover:text-white disabled:opacity-40";
  return (
    <span className={cn("flex flex-col self-stretch", className)}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={upLabel}
        title={upLabel}
        disabled={upDisabled}
        onClick={onUp}
        className={button}
      >
        <ChevronUp size={10} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={downLabel}
        title={downLabel}
        disabled={downDisabled}
        onClick={onDown}
        className={button}
      >
        <ChevronDown size={10} />
      </button>
    </span>
  );
}
