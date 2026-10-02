import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Trash2, X } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { formationGroupsFor, formationsFor } from "@/formations";
import { formationLabel, groupLabel } from "@/lib/formationText";
import { MAX_FORMATION_NAME, type FormationLibrary } from "@/share/formationLibrary";
import type { PresetSource } from "@/lib/usePresets";
import { LibraryButton, LibraryNameInput } from "@/components/ui/LibraryControls";
import { useI18n } from "@/i18n/context";

type Props = {
  doc: BoardDoc;
  /** Whether the saved list is open for renaming and deleting — the Line-up heading's pencil. */
  managing: boolean;
  teamIndex: 0 | 1;
  /** The side's catalogue formation, when it stands in one rather than a drawn shape. */
  formation: string;
  onFormationChange: (teamIndex: 0 | 1, formation: string) => void;
  /** This sport's hand-drawn formations (D122). */
  shapes: FormationLibrary;
  source: PresetSource;
  onApplyShape: (teamIndex: 0 | 1, id: string) => void;
  onSaveShape: (teamIndex: 0 | 1, name: string) => void;
  onRenameShape: (id: string, name: string) => void;
  onDeleteShape: (id: string) => void;
};

/** A drawn shape's value in the picker, told apart from a catalogue id. */
const LIBRARY = "library:";
/** The side's own shape, when the library holds nothing by that name — a shared board's. */
const OWN = "own-shape";

/**
 * The side's formation: the sport's catalogue, the coach's own drawn shapes (D122), and the
 * means to keep where the side stands now as one.
 *
 * Saving captures the active scene without moving anybody; picking one — drawn or from the
 * catalogue — lays the side out on it, as a formation change always has.
 */
export function FormationPicker({
  doc,
  managing,
  teamIndex,
  formation,
  onFormationChange,
  shapes,
  source,
  onApplyShape,
  onSaveShape,
  onRenameShape,
  onDeleteShape,
}: Props) {
  const { t } = useI18n();
  const team = doc.teams[teamIndex];
  const writable = source === "local" || source === "account";
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) nameRef.current?.select();
  }, [naming]);

  // The picker shows what the side stands in: its drawn shape, found in the library by name
  // where it can be, or the catalogue formation it was built from.
  const shape = team.shape;
  const kept = shape
    ? shapes.find((f) => f.shape.name.trim().toLowerCase() === shape.name.trim().toLowerCase())
    : undefined;
  const value = shape ? (kept ? `${LIBRARY}${kept.id}` : OWN) : formation;

  const commit = () => {
    const name = draft.trim();
    if (!name) return;
    onSaveShape(teamIndex, name);
    setNaming(false);
  };

  return (
    <div className="flex flex-col gap-1.5">

      {naming ? (
        <div className="flex gap-1">
          <input
            ref={nameRef}
            value={draft}
            maxLength={MAX_FORMATION_NAME}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder={t("shape.namePlaceholder")}
            aria-label={t("shape.nameLabel")}
            title={t("shape.hint")}
            className="min-w-0 flex-1 rounded border border-accent bg-ink-900 px-2 py-1 text-xs text-white outline-none placeholder:text-ink-400"
          />
          <LibraryButton onClick={commit} label={t("shape.save")} disabled={!draft.trim()} accent>
            <Check size={13} />
          </LibraryButton>
          <LibraryButton onClick={() => setNaming(false)} label={t("confirm.cancel")}>
            <X size={13} />
          </LibraryButton>
        </div>
      ) : (
        <div className="flex gap-1">
          <span className="relative flex min-w-0 flex-1">
          <select
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              if (next === OWN) return;
              if (next.startsWith(LIBRARY)) onApplyShape(teamIndex, next.slice(LIBRARY.length));
              else onFormationChange(teamIndex, next);
            }}
            aria-label={t("team.formation")}
            className="min-w-0 flex-1 appearance-none rounded-md border border-ink-600 bg-ink-900 py-1.5 pl-2 pr-7 text-xs text-ink-200 outline-none transition hover:border-ink-400 focus:border-accent"
          >
            {shape && !kept && <option value={OWN}>{shape.name}</option>}
            {shapes.length > 0 && (
              <optgroup label={t("shape.group")}>
                {shapes.map((f) => (
                  <option key={f.id} value={`${LIBRARY}${f.id}`}>
                    {f.shape.name}
                  </option>
                ))}
              </optgroup>
            )}
            {formationGroupsFor(doc.sport).map((group) => (
              <optgroup key={group} label={groupLabel(t, group)}>
                {formationsFor(doc.sport)
                  .filter((f) => f.group === group)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {formationLabel(t, f.id)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          </span>
          <LibraryButton
            onClick={() => {
              setDraft(shape?.name ?? t("shape.defaultName"));
              setNaming(true);
            }}
            label={t("shape.saveAs", { team: team.name })}
            disabled={!writable}
          >
            <BookmarkPlus size={13} />
          </LibraryButton>
        </div>
      )}

      {source === "offline" && <p className="text-[10px] leading-relaxed text-ink-400">{t("shape.offline")}</p>}

      {managing && shapes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border border-ink-700 bg-ink-900/60 p-1.5">
          {shapes.map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <LibraryNameInput
                // Keyed on the name, so a rename that lands remounts on it and one that
                // fails leaves what was typed in view.
                key={`${f.id}:${f.shape.name}`}
                value={f.shape.name}
                maxLength={MAX_FORMATION_NAME}
                aria-label={t("shape.rename", { name: f.shape.name })}
                onCommit={(name) => onRenameShape(f.id, name)}
              />
              <span className="shrink-0 font-mono text-[10px] text-ink-400">{f.shape.slots.length}</span>
              <LibraryButton
                onClick={() => onDeleteShape(f.id)}
                label={t("shape.delete", { name: f.shape.name })}
                small
              >
                <Trash2 size={11} />
              </LibraryButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
