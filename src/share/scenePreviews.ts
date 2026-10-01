/**
 * Whether the timeline shows each scene's preview under its track, as the reader left it.
 *
 * Per browser, through the ordinary storage layer, validated rather than trusted (D31): a
 * preference about this window, not about a board. Shown unless it was turned off.
 */

import { browserStore, keyFor, read, write, type Store } from "./storage";

export const SCENE_PREVIEWS_KEY = keyFor("scene-previews");

export const loadScenePreviews = (store: Store | null = browserStore()): boolean =>
  read(store, SCENE_PREVIEWS_KEY, (raw) => (typeof raw === "boolean" ? raw : null)) ?? true;

export const saveScenePreviews = (shown: boolean, store: Store | null = browserStore()): boolean =>
  write(store, SCENE_PREVIEWS_KEY, shown);
