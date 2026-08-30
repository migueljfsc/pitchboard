/**
 * Who is signed in, if anyone.
 *
 * Signed out is the ordinary state, not an error: accounts are optional and every part of the
 * board works without one (D39). So this resolves to `null` rather than throwing, and nothing
 * in the editor is allowed to wait on it.
 *
 * Asked once at mount. There is no polling and no revalidation on focus — a session lasts
 * thirty days, and the only things that change it happen in this tab.
 */

import { useCallback, useEffect, useState } from "react";

import { type Account, fetchAccount, signOut as signOutRequest } from "@/share/api";

export interface AccountState {
  account: Account | null;
  /** True until the first answer arrives. The UI shows nothing rather than guessing wrong. */
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => void;
}

export function useAccount(): AccountState {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    // `loading` is not re-raised on a refresh, deliberately: blanking a menu that already
    // shows a name, to show the same name a moment later, is a flicker and nothing else.
    void fetchAccount()
      .then((next) => {
        if (live) setAccount(next);
      })
      .catch(() => {
        // A failure to ask is indistinguishable from being signed out, and treating it as
        // signed out is the safe direction: it offers a sign-in rather than a broken menu.
        if (live) setAccount(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [nonce]);

  const signOut = useCallback(async () => {
    // Cleared locally first. The request cannot fail in a way that should leave the menu
    // claiming someone is still signed in, and the cookie is gone either way.
    setAccount(null);
    try {
      await signOutRequest();
    } catch {
      // The cookie expires on its own; nothing here is worth showing.
    }
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { account, loading, signOut, refresh };
}
