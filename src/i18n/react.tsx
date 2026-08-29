/**
 * The provider that puts a language in scope.
 *
 * The chosen locale is presentation, exactly like the pitch framing — it never
 * touches `BoardDoc`, never rides a share link, and is not undoable. A board made
 * in Portuguese and opened in English is the same board.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { plural, say, translate, type Dictionary, type Locale } from "./core";
import { I18nContext, type I18n } from "./context";
import { detectLocale, storeLocale, storedLocale } from "./locale";
import { en } from "./en";
import { pt } from "./pt";

const DICTIONARIES: Record<Locale, Dictionary> = { en, pt };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setChosen] = useState<Locale>(() => storedLocale() ?? detectLocale());

  // The document language is what tells a screen reader how to pronounce the
  // page, and the browser which dictionary to spell-check against.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setChosen(next);
    storeLocale(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTIONARIES[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(dict, key, vars),
      tn: (key, count, vars) => plural(dict, key, count, vars),
      tm: (message) => say(dict, message),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
