/**
 * Where the chosen language lives.
 *
 * Persisted through the ordinary storage layer, so it inherits both of its
 * rules: nothing throws, and what comes back is validated rather than trusted
 * (D31). A hand-edited locale falls back to the browser’s preference.
 */

import { browserStore, keyFor, read, write } from "@/share/storage";
import { isLocale, type Locale } from "./core";

export const LOCALE_KEY = keyFor("locale");

/** The stored choice, or null when there is not a usable one. */
export const storedLocale = (store = browserStore()): Locale | null =>
  read(store, LOCALE_KEY, (raw) => (isLocale(raw) ? raw : null));

export const storeLocale = (locale: Locale, store = browserStore()): boolean =>
  write(store, LOCALE_KEY, locale);

/**
 * The browser’s preference, where it names a language this app speaks.
 *
 * Matched on the base tag, so pt-PT, pt-BR and plain pt all land on Portuguese.
 * A pt-BR reader gets European Portuguese, which is the right failure: close
 * enough to use, and the alternative is English.
 */
export function detectLocale(tags?: readonly string[]): Locale {
  const languages =
    tags ??
    (typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));

  for (const tag of languages) {
    if (typeof tag !== "string") continue;
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
