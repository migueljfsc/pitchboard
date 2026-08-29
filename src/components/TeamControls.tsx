import { Eye, EyeOff, UserPlus } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { FORMATIONS, FORMATION_GROUPS, type Direction } from "@/formations";
import { MAX_SQUAD } from "@/board/players";
import { PALETTE } from "@/components/ui/palette";
import { contrastOn } from "@/lib/color";
import type { Change } from "@/lib/history";
import { SquadPresets } from "@/components/SquadPresets";
import type { PresetLibrary } from "@/share/presets";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  teamIndex: 0 | 1;
  onDocChange: Change<BoardDoc>;
  formation: string;
  onFormationChange: (teamIndex: 0 | 1, formation: string) => void;
  direction: Direction;
  onAddPlayer: (teamIndex: 0 | 1) => void;
  presets: PresetLibrary;
  onSavePreset: (teamIndex: 0 | 1, label: string) => void;
  onApplyPreset: (teamIndex: 0 | 1, id: string) => void;
  onRenamePreset: (id: string, label: string) => void;
  onDeletePreset: (id: string) => void;
};

export function TeamControls({
  doc,
  teamIndex,
  onDocChange,
  formation,
  onFormationChange,
  direction,
  onAddPlayer,
  presets,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
}: Props) {
  const team = doc.teams[teamIndex];

  // `merge` collapses a burst of keystrokes into one undo step; the colour
  // swatches pass nothing, so each is a step of its own.
  const patch = (fields: Partial<BoardDoc["teams"][0]>, merge?: string) => {
    const teams = doc.teams.slice() as BoardDoc["teams"];
    teams[teamIndex] = { ...teams[teamIndex], ...fields };
    onDocChange({ ...doc, teams }, merge);
  };

  return (
    <div className={cn("flex flex-col gap-3", team.hidden && "opacity-55")}>
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full ring-1 ring-white/20"
          style={{ background: team.color }}
        />
        {/* Free text: name the sides whatever the tactic calls for. */}
        <input
          value={team.name}
          onChange={(e) => patch({ name: e.target.value }, `team-name:${team.id}`)}
          placeholder="Team name"
          aria-label={`Name for team ${teamIndex + 1}`}
          className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs font-medium text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent focus:text-white"
        />
        <span className="shrink-0 font-mono text-[11px] text-ink-400" title="Attacking direction">
          {direction === "left" ? "→" : "←"}
        </span>
        <button
          type="button"
          onClick={() => patch({ hidden: !team.hidden })}
          aria-label={team.hidden ? `Show ${team.name}` : `Hide ${team.name}`}
          title={team.hidden ? "Show this team" : "Hide this team"}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded transition",
            team.hidden ? "text-ink-400 hover:text-ink-200" : "text-accent",
          )}
        >
          {team.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">Formation</span>
        <select
          value={formation}
          onChange={(e) => onFormationChange(teamIndex, e.target.value)}
          className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-ink-200 outline-none focus:border-accent"
        >
          {FORMATION_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {FORMATIONS.filter((f) => f.group === group).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <SquadPresets
        doc={doc}
        teamIndex={teamIndex}
        presets={presets}
        onSave={onSavePreset}
        onApply={onApplyPreset}
        onRename={onRenamePreset}
        onDelete={onDeletePreset}
      />

      <button
        type="button"
        disabled={team.players.length >= MAX_SQUAD}
        onClick={() => onAddPlayer(teamIndex)}
        className="flex items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-ink-200 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-45"
      >
        <UserPlus size={13} />
        Add player ({team.players.length})
      </button>

      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Set ${team.name} colour to ${c}`}
            onClick={() => patch({ color: c, textColor: contrastOn(c) })}
            className={cn(
              "size-5 rounded-full ring-1 transition",
              team.color === c ? "ring-2 ring-accent" : "ring-white/15 hover:ring-white/40",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
