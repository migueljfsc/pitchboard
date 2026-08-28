import { Eye, EyeOff } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { FORMATIONS, FORMATION_GROUPS, type Direction } from "@/formations";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  teamIndex: 0 | 1;
  onDocChange: (next: BoardDoc) => void;
  formation: string;
  onFormationChange: (teamIndex: 0 | 1, formation: string) => void;
  direction: Direction;
};

const SWATCHES = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#f8fafc", "#18181b"];

export function TeamControls({
  doc,
  teamIndex,
  onDocChange,
  formation,
  onFormationChange,
  direction,
}: Props) {
  const team = doc.teams[teamIndex];

  const patch = (fields: Partial<BoardDoc["teams"][0]>) => {
    const teams = doc.teams.slice() as BoardDoc["teams"];
    teams[teamIndex] = { ...teams[teamIndex], ...fields };
    onDocChange({ ...doc, teams });
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
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Team name"
          aria-label={`Name for team ${teamIndex + 1}`}
          className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs font-medium text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent focus:text-white"
        />
        <span className="shrink-0 font-mono text-[10px] text-ink-400" title="Attacking direction">
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
        <span className="text-[10px] uppercase tracking-wide text-ink-400">Formation</span>
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

      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((c) => (
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

/** Cheap relative-luminance pick so numbers stay readable on any kit colour. */
function contrastOn(hex: string): string {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#0b1210" : "#ffffff";
}
