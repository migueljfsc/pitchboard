/**
 * The translation runtime.
 *
 * PURE — no React, no DOM, no storage. That matters because the engine imports
 * `Message` from here: a pure function that fails has no business knowing what
 * language the person reading it speaks, so it returns a KEY and its variables
 * and the UI resolves them at the edge. Same discipline as `drawBoard` taking a
 * `RenderView` rather than reading React state.
 *
 * `en` is the source of truth for what keys exist. `pt` is typed against it, so
 * a key added to one and forgotten in the other is a compile error rather than
 * a word of English surfacing in the middle of a Portuguese sentence.
 */

import { en } from "./en";

export const LOCALES = ["en", "pt"] as const;

export type Locale = (typeof LOCALES)[number];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

export type MessageKey = keyof typeof en;
export type Dictionary = Record<MessageKey, string>;

/** Values substituted into `{name}` placeholders. */
export type Vars = Record<string, string | number>;

/**
 * A translatable string that has not been translated yet.
 *
 * What the engine returns instead of prose. Carrying the variables alongside the
 * key is what lets "3 players saved but 4-3-3 has 11 places" be assembled in a
 * language whose word order is not English's.
 */
export type Message = { key: MessageKey; vars?: Vars };

export const msg = (key: MessageKey, vars?: Vars): Message => ({ key, vars });

/** Prefixes that have `.one` and `.other` forms — the argument `plural` takes. */
type PluralPrefix<K> = K extends `${infer P}.one` ? P : never;
export type PluralKey = PluralPrefix<MessageKey>;

const FIELD = /\{(\w+)\}/g;

/**
 * Look up `key` and fill its placeholders.
 *
 * Falls back through English to the key itself. A missing key cannot happen
 * while both dictionaries typecheck, but a dictionary loaded from anywhere less
 * certain should degrade to something legible rather than blank.
 */
export function translate(dict: Dictionary, key: MessageKey, vars?: Vars): string {
  const text = dict[key] ?? en[key] ?? key;
  if (!vars) return text;
  return text.replace(FIELD, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * The `.one` or `.other` form of `key`, by `count`.
 *
 * English and European Portuguese split plurals the same way for everything on
 * this board, so one rule covers both. A language that splits differently would
 * need this to grow a per-locale rule, not the call sites to change.
 */
export function plural(
  dict: Dictionary,
  key: PluralKey,
  count: number,
  vars?: Vars,
): string {
  const form = `${key}.${count === 1 ? "one" : "other"}` as MessageKey;
  return translate(dict, form, { count, ...vars });
}

/** Resolve a message the engine handed back. */
export const say = (dict: Dictionary, message: Message): string =>
  translate(dict, message.key, message.vars);
