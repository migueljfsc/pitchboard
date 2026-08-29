/**
 * EN | PT.
 *
 * Two words and a divider rather than a dropdown: with exactly two languages a
 * select hides half the choice behind a click, and the pair reads as a state you
 * can see at a glance. It grows into a dropdown at three.
 */

import { LOCALES, type Locale } from "@/i18n/core";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

/** What each locale calls ITSELF — never translated, by definition. */
const LABEL: Record<Locale, string> = { en: "EN", pt: "PT" };

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("app.locale")}
      className="flex shrink-0 items-center rounded-md border border-ink-600 bg-ink-900"
    >
      {LOCALES.map((code, i) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className={cn(
            "px-2 py-1 text-[11px] font-medium tracking-wide transition",
            i === 0 ? "rounded-l-md" : "rounded-r-md border-l border-ink-600",
            locale === code ? "text-accent" : "text-ink-400 hover:text-ink-200",
          )}
        >
          {LABEL[code]}
        </button>
      ))}
    </div>
  );
}
