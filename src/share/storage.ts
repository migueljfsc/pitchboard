/**
 * The localStorage layer.
 *
 * Two rules, and everything above this file depends on both.
 *
 * **Nothing here throws.** Touching `localStorage` is not safe: Safari's private
 * mode throws on write, a browser set to block site data throws on read, and
 * some embedded contexts throw on the property access itself. A tactics board
 * losing its autosave is a shrug; a tactics board that will not open because it
 * could not read one is not.
 *
 * **Everything read back is untrusted.** It survives across app versions, and a
 * user can edit it in devtools. Every read takes a parser and returns null
 * rather than handing an unvalidated object to the editor.
 */

/** The slice of the Storage API used here — injectable, so tests need no DOM. */
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keys are namespaced so the origin can hold other things without collision. */
export const NAMESPACE = "pitchboard";

export const keyFor = (name: string): string => `${NAMESPACE}:${name}`;

/**
 * The browser's store, or null where there is not one. Resolved per call rather
 * than once at module load: the property access is itself the thing that throws,
 * and a module-level failure would take the whole bundle down.
 */
export function browserStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function read<T>(
  store: Store | null,
  key: string,
  parse: (raw: unknown) => T | null,
): T | null {
  if (!store) return null;
  let text: string | null;
  try {
    text = store.getItem(key);
  } catch {
    return null;
  }
  if (text === null) return null;

  try {
    return parse(JSON.parse(text));
  } catch {
    // Malformed JSON, or a parser that threw. Either way there is nothing here.
    return null;
  }
}

/** True if the value was stored. False covers a full quota as well as no store. */
export function write(store: Store | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(store: Store | null, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Nothing to do about it, and nothing depends on it having happened.
  }
}

/** An in-memory Store. Exported for tests, and for anywhere without a browser. */
export function memoryStore(seed: Record<string, string> = {}): Store {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}
