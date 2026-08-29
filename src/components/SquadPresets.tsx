import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Pencil, Trash2, X } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { MAX_PRESET_LABEL, type PresetLibrary } from "@/share/presets";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  teamIndex: 0 | 1;
  presets: PresetLibrary;
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
 */
export function SquadPresets({
  doc,
  teamIndex,
  presets,
  onSave,
  onApply,
  onRename,
  onDelete,
}: Props) {
  const team = doc.teams[teamIndex];
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [managing, setManaging] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) nameRef.current?.select();
  }, [naming]);

  const startSaving = () => {
    setDraft(team.name || "Squad");
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
        <span className="text-[11px] uppercase tracking-wide text-ink-400">Squad preset</span>
        {presets.length > 0 && !naming && (
          <button
            type="button"
            onClick={() => setManaging(!managing)}
            aria-expanded={managing}
            aria-label="Manage saved squads"
            title="Rename or delete saved squads"
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
            placeholder="Name this squad"
            aria-label="Name for the saved squad"
            className="min-w-0 flex-1 rounded border border-accent bg-ink-900 px-2 py-1 text-xs text-white outline-none placeholder:text-ink-400"
          />
          <IconButton onClick={commit} label="Save squad" disabled={!draft.trim()} accent>
            <Check size={13} />
          </IconButton>
          <IconButton onClick={() => setNaming(false)} label="Cancel">
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
            aria-label={`Load a saved squad into ${team.name}`}
            className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-ink-200 outline-none transition focus:border-accent disabled:opacity-45"
          >
            <option value="">
              {presets.length ? "Load a squad…" : "No squads saved yet"}
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.formation}
              </option>
            ))}
          </select>
          <IconButton onClick={startSaving} label={`Save ${team.name} as a squad preset`}>
            <BookmarkPlus size={13} />
          </IconButton>
        </div>
      )}

      {managing && presets.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border border-ink-700 bg-ink-900/60 p-1.5">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              <input
                value={p.label}
                maxLength={MAX_PRESET_LABEL}
                onChange={(e) => onRename(p.id, e.target.value)}
                aria-label={`Name of saved squad ${p.label}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-ink-200 outline-none transition hover:border-ink-600 focus:border-accent focus:text-white"
              />
              <span className="shrink-0 font-mono text-[10px] text-ink-400">{p.formation}</span>
              <IconButton onClick={() => onDelete(p.id)} label={`Delete squad ${p.label}`} small>
                <Trash2 size={11} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
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
