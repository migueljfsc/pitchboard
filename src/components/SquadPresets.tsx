import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Pencil, Trash2, X } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { MAX_PRESET_LABEL, type PresetLibrary } from "@/share/presets";
import type { PresetSource } from "@/lib/usePresets";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

type Props = {
  doc: BoardDoc;
  teamIndex: 0 | 1;
  presets: PresetLibrary;
  /** Where the library is — the browser, the account, or nowhere reachable. */
  source: PresetSource;
  onSave: (teamIndex: 0 | 1, label: string) => void;
  onApply: (teamIndex: 0 | 1, id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
};

/**
 * Save this side's squad, and put a saved one back.
 *
 * It sits in the Formations panel because that is where an XI is set up, and
 * saving is worth doing in the moment you finish typing eleven names rather than
 * after a trip to a dialog.
 *
 * Applying is an ordinary document edit, so it undoes in one step. That is why
 * there is no confirmation on it, even though it repositions the whole side.
 *
 * WHERE the library lives is `usePresets`'s problem, not this component's — signed in it is
 * the account's, signed out the browser's. All that reaches here is whether there is one to
 * write into: while the account is still being asked, and when it cannot be reached, saving is
 * refused rather than written somewhere the coach will not find it again.
 */
export function SquadPresets({
  doc,
  teamIndex,
  presets,
  source,
  onSave,
  onApply,
  onRename,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const team = doc.teams[teamIndex];
  const writable = source === "local" || source === "account";
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [managing, setManaging] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) nameRef.current?.select();
  }, [naming]);

  const startSaving = () => {
    setDraft(team.name || t("preset.defaultName"));
    setNaming(true);
  };

  const commit = () => {
    const label = draft.trim();
    if (!label) return;
    onSave(teamIndex, label);
    setNaming(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("preset.label")}</span>
        {presets.length > 0 && writable && !naming && (
          <button
            type="button"
            onClick={() => setManaging(!managing)}
            aria-expanded={managing}
            aria-label={t("preset.manage")}
            title={t("preset.manage.title")}
            className={cn(
              "ml-auto flex size-5 items-center justify-center rounded transition",
              managing ? "text-accent" : "text-ink-400 hover:text-ink-200",
            )}
          >
            <Pencil size={11} />
          </button>
        )}
      </div>

      {naming ? (
        <div className="flex gap-1">
          <input
            ref={nameRef}
            value={draft}
            maxLength={MAX_PRESET_LABEL}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder={t("preset.namePlaceholder")}
            aria-label={t("preset.nameLabel")}
            className="min-w-0 flex-1 rounded border border-accent bg-ink-900 px-2 py-1 text-xs text-white outline-none placeholder:text-ink-400"
          />
          <IconButton onClick={commit} label={t("preset.save")} disabled={!draft.trim()} accent>
            <Check size={13} />
          </IconButton>
          <IconButton onClick={() => setNaming(false)} label={t("confirm.cancel")}>
            <X size={13} />
          </IconButton>
        </div>
      ) : (
        <div className="flex gap-1">
          <select
            // Never holds a value: picking is an action, not a setting, and the
            // board is the record of which squad is on it.
            value=""
            disabled={presets.length === 0}
            onChange={(e) => e.target.value && onApply(teamIndex, e.target.value)}
            aria-label={t("preset.loadInto", { team: team.name })}
            className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-ink-200 outline-none transition focus:border-accent disabled:opacity-45"
          >
            <option value="">
              {t(
                presets.length
                  ? "preset.load"
                  : source === "loading"
                    ? "preset.loading"
                    : "preset.none",
              )}
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.formation}
              </option>
            ))}
          </select>
          <IconButton
            onClick={startSaving}
            label={t("preset.saveAs", { team: team.name })}
            disabled={!writable}
          >
            <BookmarkPlus size={13} />
          </IconButton>
        </div>
      )}

      {source === "offline" && (
        <p className="text-[10px] leading-relaxed text-ink-400">{t("preset.offline")}</p>
      )}

      {managing && presets.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border border-ink-700 bg-ink-900/60 p-1.5">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              <LabelInput
                // Keyed on the label, so a rename that LANDS remounts the field on the new
                // name and one that fails leaves what was typed where it can be seen.
                key={`${p.id}:${p.label}`}
                value={p.label}
                aria-label={t("preset.rename", { label: p.label })}
                onCommit={(label) => onRename(p.id, label)}
              />
              <span className="shrink-0 font-mono text-[10px] text-ink-400">{p.formation}</span>
              <IconButton onClick={() => onDelete(p.id)} label={t("preset.delete", { label: p.label })} small>
                <Trash2 size={11} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The rename field, holding its own text.
 *
 * Committed when the field is left, never on every keystroke. Signed in a keystroke is a
 * request, which is the drag-emits-a-document-per-pointermove trap wearing another coat (D26);
 * signed out it is a serialised library per character. An empty name is not a name, so leaving
 * the field blank restores what was there rather than storing nothing.
 */
function LabelInput({
  value,
  onCommit,
  "aria-label": label,
}: {
  value: string;
  onCommit: (label: string) => void;
  "aria-label": string;
}) {
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  return (
    <input
      value={draft}
      maxLength={MAX_PRESET_LABEL}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Both leave the field, and leaving it is what commits — Escape having first put
        // the old name back, so the commit finds nothing to do.
        if (e.key === "Escape") setDraft(value);
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      }}
      aria-label={label}
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-ink-200 outline-none transition hover:border-ink-600 focus:border-accent focus:text-white"
    />
  );
}

function IconButton({
  onClick,
  label,
  disabled,
  accent,
  small,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  accent?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded transition disabled:opacity-45",
        small ? "size-5" : "size-7 border",
        accent
          ? "border-accent bg-accent/15 text-accent enabled:hover:bg-accent/25"
          : small
            ? "text-ink-400 enabled:hover:text-red-300"
            : "border-ink-600 bg-ink-900 text-ink-300 enabled:hover:border-accent enabled:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
