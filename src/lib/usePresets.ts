/**
 * The squad library — where it lives, and who it belongs to.
 *
 * A preset is a squad, not a board (D30), and until now it was the BROWSER's squad: saved to
 * `localStorage` while every board went to the account. Sign in on a second machine and the
 * boards were there and the XIs were not, for no reason anybody chose. So:
 *
 *   signed out          the browser's library, exactly as it always was
 *   signed in           the account's library, one row per preset
 *   signed in, no API   nothing, and the panel says so
 *
 * ONE LIBRARY AT A TIME. While signed in nothing is written to `localStorage` — not even as a
 * cache. A second library on the machine is one nobody is reading and everybody eventually has
 * to merge, and the merge has no answer: the same squad edited on two sides is two squads.
 * That is also why adoption CLEARS the local copy rather than leaving it as a backup.
 *
 * WHICH IS WHY THE OFFLINE CASE SHOWS NOTHING. Falling back to the local library there would
 * quietly rebuild the second library this avoids, and a preset saved into it is one the coach
 * will look for on their other machine and not find. An empty list with a line saying why is
 * the honest answer: the squads are on the account, and the account cannot be reached.
 *
 * Writes go to the server and the list follows the answer. There is no optimistic list and no
 * rollback — a delete that failed leaving the row on screen is the truth, not a glitch.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { msg, type Message } from "@/i18n/core";
import {
  ApiError,
  createPreset,
  deletePreset as deleteRemote,
  listPresets,
  savePreset,
} from "@/share/api";
import {
  addPreset,
  clearPresets,
  deletePreset,
  libraryFromRows,
  loadPresets,
  renamePreset,
  replaceable,
  savePresets,
  serialisePreset,
  updatePreset,
  type PresetLibrary,
  type SquadPreset,
} from "@/share/presets";

/** Codes the Worker emits for these routes; anything else reads as the generic line. */
const KNOWN = new Set([
  "preset_limit_reached",
  "invalid_name",
  "invalid_preset",
  "not_found",
  "offline",
]);

const failure = (cause: unknown): Message => {
  const code = cause instanceof ApiError && KNOWN.has(cause.code) ? cause.code : "unknown";
  return msg(`preset.error.${code}` as "preset.error.unknown");
};

export type PresetSource =
  /** Still waiting to hear whether anyone is signed in. */
  | "loading"
  | "local"
  | "account"
  /** Signed in, and the account's library could not be read. */
  | "offline";

export interface PresetsState {
  presets: PresetLibrary;
  source: PresetSource;
  /** False while there is no library to write into — loading, or offline. */
  writable: boolean;
  error: Message | null;
  clearError: () => void;
  add: (preset: SquadPreset) => void;
  /** Re-save a squad over one already standing under that name in that shape. */
  replace: (preset: SquadPreset, replacing: SquadPreset) => void;
  rename: (id: string, label: string) => void;
  remove: (id: string) => void;
  /** What the browser still holds. The adopt offer asks this whether it has anything to make. */
  local: PresetLibrary;
  /** Copy the browser's library into the account, then forget it. */
  adopt: () => Promise<void>;
}

export function usePresets(signedIn: boolean, resolving: boolean): PresetsState {
  // Read once at mount. Nothing else in this tab writes the key, and re-reading it per render
  // would be answering a question nobody asked.
  const [local, setLocal] = useState<PresetLibrary>(() => loadPresets());
  const [account, setAccount] = useState<PresetLibrary | null>(null);
  const [reachable, setReachable] = useState(true);
  const [error, setError] = useState<Message | null>(null);
  // Adoption runs seconds after sign-in and re-reads the library itself, so it can finish
  // BEFORE the fetch below returns — and that answer is a list from before the squads were
  // copied up. Whoever wrote last is not the same as whoever knows most.
  const adopted = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void listPresets()
      .then((rows) => {
        if (!live || adopted.current) return;
        setAccount(libraryFromRows(rows));
        setReachable(true);
      })
      .catch(() => {
        // Nothing to say here beyond what the panel already says: the library is the
        // account's, and the account is not answering.
        if (live) setReachable(false);
      });
    return () => {
      live = false;
    };
  }, [signedIn]);

  const source: PresetSource = resolving
    ? "loading"
    : !signedIn
      ? "local"
      : account
        ? "account"
        : reachable
          ? "loading"
          : "offline";

  const presets = source === "local" ? local : source === "account" ? (account ?? []) : [];
  const writable = source === "local" || source === "account";

  /**
   * Written through rather than saved in an effect, so a failed write cannot leave the list on
   * screen disagreeing with storage — the rule the editor already followed.
   */
  const commitLocal = useCallback((next: PresetLibrary) => {
    setError(null);
    setLocal(next);
    savePresets(next);
  }, []);

  /** The request first and the list second: the list says what the server actually took. */
  const commitRemote = useCallback((request: () => Promise<PresetLibrary>) => {
    setError(null);
    void request()
      .then(setAccount)
      .catch((cause: unknown) => setError(failure(cause)));
  }, []);

  const add = useCallback(
    (preset: SquadPreset) => {
      if (source === "local") {
        commitLocal(addPreset(local, preset));
        return;
      }
      if (source !== "account" || !account) return;
      commitRemote(async () => {
        // The id the client minted was scoped to a list; the account mints its own.
        const row = await createPreset(preset.label, serialisePreset(preset));
        return addPreset(account, { ...preset, id: row.id });
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  const replace = useCallback(
    (preset: SquadPreset, replacing: SquadPreset) => {
      // Keeps the replaced preset's id, so it stays where it was in the list.
      const merged = { ...preset, id: replacing.id };
      if (source === "local") {
        commitLocal(updatePreset(local, merged));
        return;
      }
      if (source !== "account" || !account) return;
      commitRemote(async () => {
        await savePreset(replacing.id, merged.label, serialisePreset(merged));
        return updatePreset(account, merged);
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  const rename = useCallback(
    (id: string, label: string) => {
      if (source === "local") {
        commitLocal(renamePreset(local, id, label));
        return;
      }
      if (source !== "account" || !account) return;
      const next = renamePreset(account, id, label);
      const renamed = next.find((p) => p.id === id);
      if (!renamed) return;
      commitRemote(async () => {
        // A whole update: the squad rides along unchanged, which is what the one update route
        // takes. It is a couple of kilobytes, and it is a keystroke nobody is waiting on —
        // the name is committed when the field is left, not while it is being typed (D26).
        await savePreset(id, renamed.label, serialisePreset(renamed));
        return next;
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  const remove = useCallback(
    (id: string) => {
      if (source === "local") {
        commitLocal(deletePreset(local, id));
        return;
      }
      if (source !== "account" || !account) return;
      commitRemote(async () => {
        await deleteRemote(id);
        return deletePreset(account, id);
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  /**
   * Copy the browser's library up, then forget it.
   *
   * DEDUPED BY THE SAME RULE A RE-SAVE USES — name and shape (`replaceable`). Adoption is
   * offered on every sign-in, and someone who declines it, signs out, edits locally and signs
   * back in must not end up with two of every squad.
   *
   * The account's library is re-read first rather than trusted from state: this runs moments
   * after signing in, and the fetch it would be trusting may not have landed.
   *
   * THE LOCAL COPY IS CLEARED ONLY IF EVERY PRESET LANDED. A partial adoption leaves it alone,
   * so the offer comes back and finishes the job instead of losing the remainder to a cap or a
   * dropped connection.
   */
  const adopt = useCallback(async () => {
    if (local.length === 0) return;
    setError(null);
    try {
      let library = libraryFromRows(await listPresets());
      for (const preset of local) {
        const standing = replaceable(library, preset.label, preset.formation);
        if (standing) {
          const merged = { ...preset, id: standing.id };
          await savePreset(standing.id, merged.label, serialisePreset(merged));
          library = updatePreset(library, merged);
        } else {
          const row = await createPreset(preset.label, serialisePreset(preset));
          library = addPreset(library, { ...preset, id: row.id });
        }
      }
      adopted.current = true;
      setAccount(library);
      setReachable(true);
      clearPresets();
      setLocal([]);
    } catch (cause) {
      setError(failure(cause));
    }
  }, [local]);

  const clearError = useCallback(() => setError(null), []);

  return {
    presets,
    source,
    writable,
    error,
    clearError,
    add,
    replace,
    rename,
    remove,
    local,
    adopt,
  };
}
