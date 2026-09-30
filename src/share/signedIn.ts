/**
 * Whether this browser was signed in when it last asked. A hint and nothing more: it decides
 * only whether `/` shows the landing page or goes straight to the editor, before the account
 * request has had time to answer. Wrong either way costs one page, and the answer corrects it
 * (D31).
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const SIGNED_IN_KEY = keyFor("signed-in");

export const wasSignedIn = (store: Store | null = browserStore()): boolean =>
  read(store, SIGNED_IN_KEY, (raw) => (raw === true ? true : null)) === true;

export const rememberSignedIn = (signedIn: boolean, store: Store | null = browserStore()): boolean =>
  write(store, SIGNED_IN_KEY, signedIn);
