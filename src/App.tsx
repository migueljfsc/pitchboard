import { useEffect, useState } from "react";
import type { BoardDoc } from "@/board/types";
import { Editor } from "@/pages/Editor";
import { Viewer } from "@/pages/Viewer";
import { decodeBoard, readHash, withoutHash, type DecodeOutcome } from "@/share/urlcodec";

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
 */
export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
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

  /** Drop the payload from the address, and from this component's view of it. */
  const clearHash = () => {
    window.history.replaceState(null, "", withoutHash(window.location.href));
    // replaceState fires no hashchange, so the listener above will not see this.
    setHash("");
  };

  if (payload && !outcome) return <Splash>Opening the shared board…</Splash>;

  if (outcome && !outcome.ok) {
    return (
      <Splash tone="bad">
        {outcome.error}
        <button
          type="button"
          onClick={clearHash}
          className="mt-4 block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110"
        >
          Start a new board
        </button>
      </Splash>
    );
  }

  if (outcome?.ok) {
    return (
      <Viewer
        doc={outcome.doc}
        onFork={() => {
          setForked(outcome.doc);
          clearHash();
        }}
      />
    );
  }

  return <Editor initialDoc={forked ?? undefined} />;
}

function Splash({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-ink-900 p-8 text-center">
      <div
        className={`max-w-md text-sm leading-relaxed ${tone === "bad" ? "text-red-300" : "text-ink-300"}`}
      >
        {children}
      </div>
    </div>
  );
}
