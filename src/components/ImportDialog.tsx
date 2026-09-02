/**
 * Everything that comes IN, in one place.
 *
 * Three shapes open here, and the FILE says which it is rather than the coach:
 *
 *   BOARD   a whole play — what Export writes, reopened exactly as it was left.
 *   SETUP   formation, XI and units, no scenes. The shape worth hand-writing.
 *   TRACKS  positions measured off video, already in pitch metres. `fromJson`
 *           tells it apart by `source` and `tracks` BEFORE the board branch,
 *           because a tracks file also declares `version: 1` and would otherwise
 *           arrive as a broken board, with errors describing the wrong thing.
 *
 * So there is no format picker: it would be a choice the code does not take. The
 * three are listed instead, because until this dialog existed nothing in the app
 * said a tracks file could be opened at all — it was one hint line, two levels
 * inside a dialog titled "send this board to someone".
 *
 * The file picker leads and the textarea follows. A tracks file is megabytes of
 * samples, so pasting one is not a real path, and a loaded file is reported as a
 * name and a size rather than rendered into a textarea that would stall on it.
 */

import { useEffect, useRef, useState } from "react";
import { Check, FileUp, X } from "lucide-react";

import type { BoardDoc } from "@/board/types";
import { Action } from "@/components/ui/DialogControls";
import { useI18n } from "@/i18n/context";
import type { Message } from "@/i18n/core";
import { cn } from "@/lib/utils";
import { SETUP_EXAMPLE, fromJson, type ImportOutcome } from "@/share/json";

/** Which of the three shapes a file turned out to be. */
export type ImportKind = Extract<ImportOutcome, { ok: true }>["kind"];

/** Typed by hand, or opened from disk. One at a time — the other is not a draft. */
type Source =
  | { kind: "typed"; text: string }
  | { kind: "file"; name: string; bytes: number; text: string };

type Props = {
  onImport: (doc: BoardDoc, kind: ImportKind) => void;
  onClose: () => void;
  /** A confirmation is up over this dialog, and owns the keyboard. */
  blocked?: boolean;
};

export function ImportDialog({ onImport, onClose, blocked }: Props) {
  const { t, tm } = useI18n();
  const [source, setSource] = useState<Source>({ kind: "typed", text: "" });
  const [error, setError] = useState<Message | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // While a confirmation is up, Escape belongs to it. Both listeners are on the window, so
    // the only reliable way to stay out of its way is not to listen at all.
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, blocked]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSource({ kind: "file", name: file.name, bytes: file.size, text: await file.text() });
  };

  const submit = () => {
    const outcome = fromJson(source.text);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    onImport(outcome.doc, outcome.kind);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="import-title" className="text-sm font-semibold text-white">
            {t("import.dialog.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("import.close")}
            className="ml-auto flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-3 p-4">
          <p className="text-[11px] leading-relaxed text-ink-300">{t("import.kinds")}</p>

          <ul className="flex flex-col gap-2 rounded border border-ink-700 bg-ink-900 px-3 py-2.5">
            {(["board", "setup", "tracks"] as const).map((kind) => (
              <li key={kind}>
                <p className="text-[11px] font-medium text-ink-100">{t(`import.kind.${kind}`)}</p>
                <p className="text-[11px] leading-relaxed text-ink-400">
                  {t(`import.kind.${kind}.hint`)}
                </p>
              </li>
            ))}
          </ul>

          {/* The drop target stays a drop target once a file is in it: opening the wrong
              one and dragging the right one over is the ordinary correction. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              // A drag crossing a child fires dragleave on the parent. Only a pointer that
              // has actually left the box counts, or the highlight flickers on every icon.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void load(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded border border-dashed px-4 py-5 text-center transition",
              dragging ? "border-accent bg-accent/10" : "border-ink-600",
            )}
          >
            {source.kind === "file" ? (
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="truncate font-mono text-[11px] text-ink-200">{source.name}</span>
                <span className="font-mono text-[11px] text-ink-400">{megabytes(source.bytes)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSource({ kind: "typed", text: "" });
                    setError(null);
                  }}
                  className="ml-auto text-[11px] text-accent transition hover:brightness-110"
                >
                  {t("import.file.clear")}
                </button>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-ink-300">
                  {t(dragging ? "import.dropping" : "import.drop")}
                </p>
                <Action onClick={() => fileRef.current?.click()} icon={FileUp}>
                  {t("import.loadFile")}
                </Action>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void load(e.target.files?.[0])}
            />
          </div>

          {source.kind === "typed" && (
            <>
              <p className="text-[11px] leading-relaxed text-ink-300">{t("import.paste")}</p>
              <textarea
                value={source.text}
                onChange={(e) => {
                  setSource({ kind: "typed", text: e.target.value });
                  setError(null);
                }}
                placeholder={SETUP_EXAMPLE}
                aria-label={t("import.label")}
                className="min-h-0 flex-1 resize-none rounded border border-ink-600 bg-ink-900 p-2 font-mono text-[11px] leading-relaxed text-ink-200 outline-none transition placeholder:text-ink-500 focus:border-accent"
                rows={12}
              />
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
            >
              {tm(error)}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {source.kind === "typed" && (
              <Action onClick={() => setSource({ kind: "typed", text: SETUP_EXAMPLE })} icon={FileUp}>
                {t("import.useExample")}
              </Action>
            )}
            <Action onClick={submit} icon={Check} primary disabled={!source.text.trim()}>
              {t("import.replaceBoard")}
            </Action>
          </div>
        </div>
      </div>
    </div>
  );
}

const megabytes = (bytes: number) =>
  bytes < 1e6 ? `${Math.round(bytes / 1e3)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;
