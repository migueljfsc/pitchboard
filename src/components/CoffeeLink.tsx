import { Coffee } from "lucide-react";
import { useI18n } from "@/i18n/context";

/**
 * Buy Me a Coffee, last on every page's bar. A plain link in the app's accent rather than their
 * embed script — a script tag in React never runs, and theirs would send every visitor's IP to
 * a third party. Not a control, so it sits past the controls, behind a divider, as an icon only.
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
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-ink-900 transition hover:brightness-110"
    >
      <Coffee size={14} />
    </a>
  );
}
