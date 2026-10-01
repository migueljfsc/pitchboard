import { Coffee } from "lucide-react";
import { useI18n } from "@/i18n/context";

/**
 * Buy Me a Coffee, last on every page's bar. A plain link rather than their
 * embed script — a script tag in React never runs, and theirs would send every visitor's IP to
 * a third party. Not a control, so it sits past the controls, behind a divider. It wears the
 * chrome's one warm colour so it is noticed, and is named where the bar has room for it.
 */
export function CoffeeLink() {
  const { t } = useI18n();
  return (
    <a
      href="https://buymeacoffee.com/migueljfsc"
      target="_blank"
      rel="noopener noreferrer"
      title={t("app.coffee")}
      aria-label={t("app.coffee")}
      className="flex h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-full border border-crema/35 px-2 text-xs font-medium text-crema transition hover:border-crema/70 hover:bg-crema/10 xl:px-2.5"
    >
      <Coffee size={14} className="shrink-0" />
      <span className="hidden whitespace-nowrap xl:inline">{t("app.coffee")}</span>
    </a>
  );
}
