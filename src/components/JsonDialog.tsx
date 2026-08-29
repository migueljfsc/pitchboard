import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FileUp, X } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { SETUP_EXAMPLE, fromJson, toJson, toSetupJson } from "@/share/json";
import { cn, slug } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import { msg, type Message } from "@/i18n/core";

type Props = {
  doc: BoardDoc;
  onImport: (doc: BoardDoc) => void;
  onClose: () => void;
  /** A confirmation is up over this dialog, and owns the keyboard. */
  blocked?: boolean;
};

type Tab = "export" | "import";
type Shape = "board" | "setup";

/**
 * Boards in and out as JSON.
 *
 * Export writes the whole document, which is what you send someone so they open
 * the play exactly as you left it. Setup writes the short form — formation, XI
 * and units, no scenes — which is the shape worth hand-writing.
 *
 * Import takes either, told apart by `version`, and validates before anything
 * reaches the editor.
 */
export function JsonDialog({ doc, onImport, onClose, blocked }: Props) {
  const { t, tm } = useI18n();
  const [tab, setTab] = useState<Tab>("export");
  const [shape, setShape] = useState<Shape>("board");
  const [text, setText] = useState("");
  const [error, setError] = useState<Message | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const payload = shape === "board" ? toJson(doc) : toSetupJson(doc);

  useEffect(() => {
    // While a confirmation is up, Escape belongs to it. Both listeners are on
    // the window, so the only reliable way to stay out of its way is not to
    // listen at all.
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(msg("json.clipboard"));
    }
  };

  const download = () => {
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(doc.name)}${shape === "setup" ? ".setup" : ""}.json`;
    a.click();
    // Revoking immediately can beat the download in Safari; a tick is enough.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setError(null);
  };

  const submit = () => {
    const outcome = fromJson(text);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    onImport(outcome.doc);
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
        aria-labelledby="json-title"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
          <h2 id="json-title" className="text-sm font-semibold text-white">
            {t("json.title")}
          </h2>
          <div className="flex gap-1">
            <Toggle active={tab === "export"} onClick={() => setTab("export")}>
              {t("json.export")}
            </Toggle>
            <Toggle
              active={tab === "import"}
              onClick={() => {
                setTab("import");
                setError(null);
              }}
            >
              {t("json.import")}
            </Toggle>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("json.close")}
            className="ml-auto flex size-6 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {tab === "export" ? (
          <div className="flex min-h-0 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                <Toggle active={shape === "board"} onClick={() => setShape("board")}>
                  {t("json.wholeBoard")}
                </Toggle>
                <Toggle active={shape === "setup"} onClick={() => setShape("setup")}>
                  {t("json.setupOnly")}
                </Toggle>
              </div>
              <span className="text-[11px] text-ink-400">
                {t(shape === "board" ? "json.wholeBoard.hint" : "json.setupOnly.hint")}
              </span>
            </div>

            <textarea
              readOnly
              value={payload}
              aria-label={t("json.payload.label")}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-0 flex-1 resize-none rounded border border-ink-600 bg-ink-900 p-2 font-mono text-[11px] leading-relaxed text-ink-300 outline-none"
              rows={16}
            />

            <div className="flex justify-end gap-2">
              <Action onClick={copy} icon={copied ? Check : Copy}>
                {t(copied ? "json.copied" : "json.copy")}
              </Action>
              <Action onClick={download} icon={Download} primary>
                {t("json.download")}
              </Action>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 p-4">
            <p className="text-[11px] leading-relaxed text-ink-300">
              {t("json.import.hint")}
            </p>

            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder={SETUP_EXAMPLE}
              aria-label={t("json.import.label")}
              className="min-h-0 flex-1 resize-none rounded border border-ink-600 bg-ink-900 p-2 font-mono text-[11px] leading-relaxed text-ink-200 outline-none transition placeholder:text-ink-500 focus:border-accent"
              rows={16}
            />

            {error && (
              <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                {tm(error)}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void load(e.target.files?.[0])}
              />
              <Action onClick={() => fileRef.current?.click()} icon={FileUp}>
                {t("json.loadFile")}
              </Action>
              <Action onClick={() => setText(SETUP_EXAMPLE)} icon={Copy}>
                {t("json.useExample")}
              </Action>
              <Action onClick={submit} icon={Check} primary disabled={!text.trim()}>
                {t("json.replaceBoard")}
              </Action>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded border px-2 py-1 text-[11px] transition",
        active
          ? "border-accent text-accent"
          : "border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-200",
      )}
    >
      {children}
    </button>
  );
}

function Action({
  onClick,
  icon: Icon,
  primary,
  disabled,
  children,
}: {
  onClick: () => void;
  icon: typeof Copy;
  primary?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition disabled:opacity-45",
        primary
          ? "bg-accent font-medium text-ink-900 enabled:hover:brightness-110"
          : "border border-ink-600 text-ink-200 enabled:hover:border-ink-400 enabled:hover:text-white",
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  );
}
