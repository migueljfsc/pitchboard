import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { toJson, toSetupJson } from "@/share/json";
import { slug } from "@/lib/utils";
import { Action, Toggle } from "@/components/ui/DialogControls";
import { useI18n } from "@/i18n/context";

type Props = {
  doc: BoardDoc;
};

type Shape = "board" | "setup";

/**
 * The board out as JSON — a pane inside the export dialog, not a dialog of its own.
 *
 * A file is a format the board comes out in, alongside MP4, GIF and PNG, so it sits with
 * them rather than under Share. It used to hold the import half too; that is now its own
 * dialog, reached from its own button, because opening a file is not a way of handing the
 * board to anybody — see `ImportDialog`.
 *
 * Whole board writes the document, which is what you send someone so they open the play
 * exactly as you left it. Setup writes the short form — formation, XI and units, no
 * scenes — which is the shape worth hand-writing.
 */
export function JsonPane({ doc }: Props) {
  const { t } = useI18n();
  const [shape, setShape] = useState<Shape>("board");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const payload = shape === "board" ? toJson(doc) : toSetupJson(doc);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
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

  return (
    <div className="flex min-h-0 flex-col gap-3">
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
        rows={14}
      />

      {failed && (
        <p role="alert" className="text-[11px] text-red-300">
          {t("json.clipboard")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Action onClick={() => void copy()} icon={copied ? Check : Copy}>
          {t(copied ? "json.copied" : "json.copy")}
        </Action>
        <Action onClick={download} icon={Download} primary>
          {t("json.download")}
        </Action>
      </div>
    </div>
  );
}
