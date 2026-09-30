import { lazy, Suspense, useEffect, useState } from "react";
import type { BoardDoc } from "@/board/types";
import { Editor } from "@/pages/Editor";
import { Viewer } from "@/pages/Viewer";
import { decodeBoard, readHash, readView, withoutHash, type DecodeOutcome } from "@/share/urlcodec";
import { fetchShare } from "@/share/api";
import { parseStoredDoc } from "@/share/cloud";
import { APP_PATH, isAdminPath, isLandingPath, readShareSlug } from "@/share/routes";
import { Landing } from "@/pages/Landing";
import { useI18n } from "@/i18n/context";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/** Loaded only on /admin, so no visitor downloads the operator's page. */
const Admin = lazy(() => import("@/pages/Admin").then((m) => ({ default: m.Admin })));

/**
 * Chooses what the address is asking for.
 *
 * A `#d=` link opens read-only; anything else is the editor. No router: the app
 * is one page and a share link is a fragment, which is also what lets it work on
 * a static host with no rewrite rules behind it.
 *
 * The hash is watched rather than read once. Pasting a link into the address bar
 * of a tab that already has Pitchboard open changes the fragment WITHOUT
 * reloading, so a one-shot read at mount leaves the recipient looking at their
 * own board and wondering what the link did.
 *
 * Forking clears the hash and drops into the editor with a local copy. The link
 * still holds the original, so there is nothing to overwrite and no permission
 * to grant — the whole of D7's authorisation model.
 *
 * Paths mean two more things, both listed in `share/routes.ts`: `/share/<slug>` is
 * a published board, read-only and open to anyone; `/board/<id>` is a saved board
 * opened for editing, which the Editor resolves for itself since it needs an
 * account to do it. This is still not a router — a path is one more thing the
 * address can be, read once, because changing one is a page load rather than an
 * event. Both resolve because the Worker serves index.html for unknown paths.
 */
export function App() {
  const { t, tm } = useI18n();
  const [hash, setHash] = useState(() => window.location.hash);
  const [slug, setSlug] = useState<string | null>(() => readShareSlug());
  /** The published board, or "missing" once the server has said so. */
  const [shared, setShared] = useState<BoardDoc | "missing" | null>(null);
  const [forked, setForked] = useState<BoardDoc | null>(null);
  /** The last decode, tagged with the payload it came from. */
  const [opened, setOpened] = useState<{ payload: string; outcome: DecodeOutcome } | null>(null);

  const payload = readHash(hash);
  // A result for a payload the address no longer carries is not an answer to
  // the question being asked, which is what keeps this out of an effect.
  const outcome = payload && opened?.payload === payload ? opened.outcome : null;

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!payload) return;
    let live = true;
    void decodeBoard(payload).then((result) => {
      if (live) setOpened({ payload, outcome: result });
    });
    return () => {
      live = false;
    };
  }, [payload]);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    void fetchShare(slug)
      .then((share) => {
        // A published document is validated exactly like one from a file or the hash: the
        // server stores it opaquely, and `schema.ts` is the only validator (D31).
        const doc = parseStoredDoc(share.doc);
        if (live) setShared(doc ?? "missing");
      })
      .catch(() => {
        if (live) setShared("missing");
      });
    return () => {
      live = false;
    };
  }, [slug]);

  /** Leave the share path behind, so a fork lands in a plain editor. */
  const clearPath = () => {
    window.history.replaceState(null, "", APP_PATH);
    setSlug(null);
    setShared(null);
  };

  /** Drop the payload from the address, and from this component's view of it. */
  const clearHash = () => {
    // A link to the root was a board at the root; leaving it is going to the editor, not
    // back to the landing page.
    const url = new URL(withoutHash(window.location.href));
    if (isLandingPath(url.pathname)) url.pathname = APP_PATH;
    window.history.replaceState(null, "", url.toString());
    // replaceState fires no hashchange, so the listener above will not see this.
    setHash("");
  };

  if (isAdminPath()) {
    return (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    );
  }

  if (slug && !shared) return <Splash>{t("share.opening")}</Splash>;

  if (shared === "missing") {
    return (
      <Splash tone="bad">
        {t("share.missing")}
        <button
          type="button"
          onClick={clearPath}
          className="mt-4 block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110"
        >
          {t("app.newBoard")}
        </button>
      </Splash>
    );
  }

  if (shared) {
    return (
      <Viewer
        key={slug}
        doc={shared}
        onFork={() => {
          setForked(shared);
          clearPath();
        }}
      />
    );
  }

  if (payload && !outcome) return <Splash>{t("app.opening")}</Splash>;

  if (outcome && !outcome.ok) {
    return (
      <Splash tone="bad">
        {tm(outcome.error)}
        <button
          type="button"
          onClick={clearHash}
          className="mt-4 block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110"
        >
          {t("app.newBoard")}
        </button>
      </Splash>
    );
  }

  if (outcome?.ok) {
    return (
      <Viewer
        // Remounted per link, so pasting a second one into an open tab picks up
        // its framing instead of keeping the first link's initial state.
        key={payload}
        doc={outcome.doc}
        initialView={readView(hash) ?? undefined}
        onFork={() => {
          setForked(outcome.doc);
          clearHash();
        }}
      />
    );
  }

  if (isLandingPath() && !forked) return <Landing />;

  return <Editor initialDoc={forked ?? undefined} />;
}

function Splash({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-ink-900 p-8 text-center">
      <LogoMark className={cn("size-10", tone !== "bad" && "animate-pulse")} />
      <div
        className={`max-w-md animate-fade-up text-sm leading-relaxed ${tone === "bad" ? "text-red-300" : "text-ink-300"}`}
      >
        {children}
      </div>
    </div>
  );
}
