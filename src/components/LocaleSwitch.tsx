/**
 * The language, as one small button: it shows the one in use and switches to the next.
 *
 * With two languages a press can only mean "the other one", so a pair of buttons spent its
 * width saying what a tooltip can. The tooltip names the language it goes to, in that
 * language's own words, so someone who cannot read the current one can still find theirs.
 */

import { LOCALES, type Locale } from "@/i18n/core";
import { useI18n } from "@/i18n/context";

/** What each locale calls ITSELF — never translated, by definition. */
const LABEL: Record<Locale, string> = { en: "EN", pt: "PT" };
const NAME: Record<Locale, string> = { en: "English", pt: "Português" };

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];

  return (
    <button
      type="button"
      lang={next}
      onClick={() => setLocale(next)}
      aria-label={`${t("app.locale")}: ${NAME[locale]}. ${NAME[next]}`}
      title={NAME[next]}
      className="shrink-0 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] font-medium tracking-wide text-ink-200 transition hover:border-accent hover:text-white"
    >
      {LABEL[locale]}
    </button>
  );
}
