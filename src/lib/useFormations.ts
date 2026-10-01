/**
 * The library of hand-drawn formations — where it lives, and who it belongs to (D122).
 *
 * The squad library's rules exactly (`usePresets`, D30): the browser's while signed out, the
 * account's while signed in, nothing while the account cannot be reached, and never both. Writes
 * go to the server and the list follows the answer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { msg, type Message } from "@/i18n/core";
import {
  ApiError,
  createFormation,
  deleteFormation as deleteRemote,
  listFormations,
  saveFormation,
} from "@/share/api";
import {
  addFormation,
  clearFormations,
  deleteFormation,
  formationLibraryFromRows,
  loadFormations,
  renameFormation,
  sameName,
  saveFormations,
  serialiseFormation,
  updateFormation,
  type CustomFormation,
  type FormationLibrary,
} from "@/share/formationLibrary";
import type { PresetSource } from "@/lib/usePresets";

/** Codes the Worker emits for these routes; anything else reads as the generic line. */
const KNOWN = new Set(["formation_limit_reached", "invalid_name", "invalid_formation", "not_found", "offline"]);

const failure = (cause: unknown): Message => {
  const code = cause instanceof ApiError && KNOWN.has(cause.code) ? cause.code : "unknown";
  return msg(`shape.error.${code}` as "shape.error.unknown");
};

export interface FormationsState {
  formations: FormationLibrary;
  source: PresetSource;
  writable: boolean;
  error: Message | null;
  clearError: () => void;
  /** Keep a shape; one of the same name in the same sport is replaced, keeping its place. */
  save: (formation: CustomFormation) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  local: FormationLibrary;
  adopt: () => Promise<void>;
}

export function useFormations(signedIn: boolean, resolving: boolean): FormationsState {
  const [local, setLocal] = useState<FormationLibrary>(() => loadFormations());
  const [account, setAccount] = useState<FormationLibrary | null>(null);
  const [reachable, setReachable] = useState(true);
  const [error, setError] = useState<Message | null>(null);
  // Adoption can finish before the first fetch returns, and that answer predates it.
  const adopted = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void listFormations()
      .then((rows) => {
        if (!live || adopted.current) return;
        setAccount(formationLibraryFromRows(rows));
        setReachable(true);
      })
      .catch(() => {
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

  const formations = source === "local" ? local : source === "account" ? (account ?? []) : [];
  const writable = source === "local" || source === "account";

  const commitLocal = useCallback((next: FormationLibrary) => {
    setError(null);
    setLocal(next);
    saveFormations(next);
  }, []);

  const commitRemote = useCallback((request: () => Promise<FormationLibrary>) => {
    setError(null);
    void request()
      .then(setAccount)
      .catch((cause: unknown) => setError(failure(cause)));
  }, []);

  const save = useCallback(
    (formation: CustomFormation) => {
      const list = source === "local" ? local : account;
      if (!list || (source !== "local" && source !== "account")) return;
      const standing = sameName(list, formation.shape.name, formation.sport ?? "football");
      const merged = standing ? { ...formation, id: standing.id } : formation;

      if (source === "local") {
        commitLocal(standing ? updateFormation(local, merged) : addFormation(local, merged));
        return;
      }
      commitRemote(async () => {
        if (standing) {
          await saveFormation(standing.id, merged.shape.name, serialiseFormation(merged));
          return updateFormation(list, merged);
        }
        // The id the client minted was scoped to a list; the account mints its own.
        const row = await createFormation(merged.shape.name, serialiseFormation(merged));
        return addFormation(list, { ...merged, id: row.id });
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      if (source === "local") {
        commitLocal(renameFormation(local, id, name));
        return;
      }
      if (source !== "account" || !account) return;
      const next = renameFormation(account, id, name);
      const renamed = next.find((f) => f.id === id);
      if (!renamed) return;
      commitRemote(async () => {
        await saveFormation(id, renamed.shape.name, serialiseFormation(renamed));
        return next;
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  const remove = useCallback(
    (id: string) => {
      if (source === "local") {
        commitLocal(deleteFormation(local, id));
        return;
      }
      if (source !== "account" || !account) return;
      commitRemote(async () => {
        await deleteRemote(id);
        return deleteFormation(account, id);
      });
    },
    [source, local, account, commitLocal, commitRemote],
  );

  /**
   * Copy the browser's shapes up, then forget them — deduped by name and sport, as a save is,
   * and cleared only once every one landed, so a partial adoption is offered again.
   */
  const adopt = useCallback(async () => {
    if (local.length === 0) return;
    setError(null);
    try {
      let library = formationLibraryFromRows(await listFormations());
      for (const formation of local) {
        const standing = sameName(library, formation.shape.name, formation.sport ?? "football");
        if (standing) {
          const merged = { ...formation, id: standing.id };
          await saveFormation(standing.id, merged.shape.name, serialiseFormation(merged));
          library = updateFormation(library, merged);
        } else {
          const row = await createFormation(formation.shape.name, serialiseFormation(formation));
          library = addFormation(library, { ...formation, id: row.id });
        }
      }
      adopted.current = true;
      setAccount(library);
      setReachable(true);
      clearFormations();
      setLocal([]);
    } catch (cause) {
      setError(failure(cause));
    }
  }, [local]);

  const clearError = useCallback(() => setError(null), []);

  return { formations, source, writable, error, clearError, save, rename, remove, local, adopt };
}
