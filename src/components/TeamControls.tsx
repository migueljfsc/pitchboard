import { Eye, EyeOff, UserPlus } from "lucide-react";
import type { BoardDoc, TeamPattern } from "@/board/types";
import { FORMATIONS, FORMATION_GROUPS, type Direction } from "@/formations";
import { MAX_SQUAD } from "@/board/players";
import { PALETTE } from "@/components/ui/palette";
import { contrastOn } from "@/lib/color";
import type { Change } from "@/lib/history";
import { SquadPresets } from "@/components/SquadPresets";
import type { PresetLibrary } from "@/share/presets";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

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
  const { t } = useI18n();
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
          placeholder={t("team.namePlaceholder")}
          aria-label={t("team.nameLabel", { n: teamIndex + 1 })}
          className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs font-medium text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent focus:text-white"
        />
        <span className="shrink-0 font-mono text-[11px] text-ink-400" title={t("team.direction")}>
          {direction === "left" ? "→" : "←"}
        </span>
        <button
          type="button"
          onClick={() => patch({ hidden: !team.hidden })}
          aria-label={t(team.hidden ? "team.showAria" : "team.hideAria", { team: team.name })}
          title={t(team.hidden ? "team.show" : "team.hide")}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded transition",
            team.hidden ? "text-ink-400 hover:text-ink-200" : "text-accent",
          )}
        >
          {team.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("team.formation")}</span>
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
        {t("team.addPlayer", { n: team.players.length })}
      </button>

      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t("team.colorAria", { team: team.name, color: c })}
            onClick={() => patch({ color: c, textColor: contrastOn(c) })}
            className={cn(
              "size-5 rounded-full ring-1 transition",
              team.color === c ? "ring-2 ring-accent" : "ring-white/15 hover:ring-white/40",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      <div className="flex gap-1.5">
        {PATTERNS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-label={t("team.patternAria", { pattern: t(p.key), team: team.name })}
            aria-pressed={(team.pattern ?? "solid") === p.value}
            onClick={() => patch({ pattern: p.value === "solid" ? undefined : p.value })}
            title={t(p.key)}
            className={cn(
              "h-5 flex-1 rounded ring-1 transition",
              (team.pattern ?? "solid") === p.value
                ? "ring-2 ring-accent"
                : "ring-white/15 hover:ring-white/40",
            )}
            style={{ background: swatch(p.value, team.color) }}
          />
        ))}
      </div>
    </div>
  );
}

const PATTERNS: {
  value: TeamPattern;
  key: "pattern.solid" | "pattern.vertical" | "pattern.horizontal";
}[] = [
  { value: "solid", key: "pattern.solid" },
  { value: "vertical", key: "pattern.vertical" },
  { value: "horizontal", key: "pattern.horizontal" },
];

/**
 * The swatch preview.
 *
 * Deliberately the same five bands the renderer paints, so what the button shows
 * is what lands on the token rather than an icon standing in for it.
 */
function swatch(pattern: TeamPattern, color: string): string {
  if (pattern === "solid") return color;
  const angle = pattern === "vertical" ? "90deg" : "180deg";
  const w = "rgba(255,255,255,0.92)";
  return `linear-gradient(${angle}, ${color} 0 20%, ${w} 20% 40%, ${color} 40% 60%, ${w} 60% 80%, ${color} 80%)`;
}
