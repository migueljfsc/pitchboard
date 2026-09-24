import { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { dismissTip, tipDismissed } from "@/share/tips";
import { useI18n } from "@/i18n/context";
import { MODIFIER } from "@/lib/platform";

/**
 * One line of how the board is worked, over the top of it, until it is closed.
 *
 * The gestures that matter most — dragging, double-clicking, stepping scenes —
 * have no button anywhere to discover them by. Closed once, gone for good in this
 * browser.
 */
export function BoardTip() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => !tipDismissed());
  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-2xl items-center gap-2.5 rounded-full border border-ink-600 bg-ink-800/90 py-1.5 pl-3 pr-1.5 text-[11px] text-ink-200 shadow-lg backdrop-blur">
        <Lightbulb size={13} className="shrink-0 text-accent" />
        <span>{t("tip.board", { palette: `${MODIFIER}K` })}</span>
        <button
          type="button"
          onClick={() => {
            dismissTip();
            setOpen(false);
          }}
          aria-label={t("tip.dismiss")}
          title={t("tip.dismiss")}
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-700 hover:text-white"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
