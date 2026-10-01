import { useState } from "react";
import { ChevronDown, Eye, EyeOff, UserPlus } from "lucide-react";
import type { BoardDoc, Player, TeamPattern } from "@/board/types";
import type { Direction } from "@/formations";
import { sportOf } from "@/board/sports";
import { MAX_SQUAD, keeperOf, setPlayerLabel, setPlayerNumber, shirtClash } from "@/board/players";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { Stepper } from "@/components/ui/Stepper";
import { contrastOn } from "@/lib/color";
import type { Change } from "@/lib/history";
import { SquadPresets } from "@/components/SquadPresets";
import { FormationPicker } from "@/components/FormationPicker";
import type { FormationLibrary } from "@/share/formationLibrary";
import type { PresetLibrary } from "@/share/presets";
import type { PresetSource } from "@/lib/usePresets";
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
  presetSource: PresetSource;
  onSavePreset: (teamIndex: 0 | 1, label: string) => void;
  onApplyPreset: (teamIndex: 0 | 1, id: string) => void;
  onRenamePreset: (id: string, label: string) => void;
  onDeletePreset: (id: string) => void;
  /** This sport's hand-drawn formations (D122). */
  shapes: FormationLibrary;
  shapeSource: PresetSource;
  onApplyShape: (teamIndex: 0 | 1, id: string) => void;
  onSaveShape: (teamIndex: 0 | 1, name: string) => void;
  onRenameShape: (id: string, name: string) => void;
  onDeleteShape: (id: string) => void;
  selection: ReadonlySet<string>;
  /** Select one player, as a click on his token would. */
  onSelectPlayer: (id: string) => void;
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
  presetSource,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
  shapes,
  shapeSource,
  onApplyShape,
  onSaveShape,
  onRenameShape,
  onDeleteShape,
  selection,
  onSelectPlayer,
}: Props) {
  const { t } = useI18n();
  const team = doc.teams[teamIndex];
  const [kitOpen, setKitOpen] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);
  // `merge` collapses a burst of keystrokes into one undo step; the colour
  // pickers pass nothing, so each is a step of its own.
  const patch = (fields: Partial<BoardDoc["teams"][0]>, merge?: string) => {
    const teams = doc.teams.slice() as BoardDoc["teams"];
    teams[teamIndex] = { ...teams[teamIndex], ...fields };
    onDocChange({ ...doc, teams }, merge);
  };

  return (
    <div className={cn("flex flex-col gap-3", team.hidden && "opacity-55")}>
      <div className="flex flex-col gap-1.5">
        {/* Free text: name the sides whatever the tactic calls for. */}
        <input
          value={team.name}
          onChange={(e) => patch({ name: e.target.value }, `team-name:${team.id}`)}
          placeholder={t("team.namePlaceholder")}
          aria-label={t("team.nameLabel", { n: teamIndex + 1 })}
          className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs font-medium text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent focus:text-white"
        />
        {/* Which way the side plays and whether it is drawn, said in words: an arrow and an
            eye on their own were read as decoration. */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-400" title={t("team.direction")}>
            {t(direction === "left" ? "team.attacks.right" : "team.attacks.left")}
          </span>
          <button
            type="button"
            onClick={() => patch({ hidden: !team.hidden })}
            aria-label={t(team.hidden ? "team.showAria" : "team.hideAria", { team: team.name })}
            aria-pressed={team.hidden ?? false}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-ink-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            {team.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            {t(team.hidden ? "team.show" : "team.hide")}
          </button>
        </div>
      </div>

      <FormationPicker
        doc={doc}
        teamIndex={teamIndex}
        formation={formation}
        onFormationChange={onFormationChange}
        shapes={shapes}
        source={shapeSource}
        onApplyShape={onApplyShape}
        onSaveShape={onSaveShape}
        onRenameShape={onRenameShape}
        onDeleteShape={onDeleteShape}
      />

      <SquadPresets
        doc={doc}
        teamIndex={teamIndex}
        presets={presets}
        source={presetSource}
        onSave={onSavePreset}
        onApply={onApplyPreset}
        onRename={onRenamePreset}
        onDelete={onDeletePreset}
      />

      {/* Who is on the team, by shirt: renamed and renumbered in place, and a click on the
          token selects him on the board — finding the 7 among twenty-two tokens is slower. */}
      <button
        type="button"
        onClick={() => setSquadOpen(!squadOpen)}
        aria-expanded={squadOpen}
        className="flex items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-white/[0.04]"
      >
        <ChevronDown size={12} className={cn("shrink-0 text-ink-400 transition-transform", !squadOpen && "-rotate-90")} />
        <span className="flex-1 text-xs text-ink-400">{t("team.squad")}</span>
        <span className="font-mono text-[11px] text-ink-500">{team.players.length}</span>
      </button>
      {squadOpen && (
        <div className="flex flex-col gap-1 pl-1">
          {/* In the team's own order, never by number: a row that jumped as its shirt changed
              would look like a player arriving at the bottom of the list. */}
          {team.players.map((p) => (
              <SquadRow
                key={p.id}
                doc={doc}
                player={p}
                color={keeperOf(team) === p.id && team.keeper ? team.keeper.color : team.color}
                textColor={keeperOf(team) === p.id && team.keeper ? team.keeper.textColor : team.textColor}
                selected={selection.has(p.id)}
                onSelect={() => onSelectPlayer(p.id)}
                onRename={(label) => onDocChange(setPlayerLabel(doc, p.id, label), `label:${p.id}`)}
                onRenumber={(n) => onDocChange(setPlayerNumber(doc, p.id, n), `number:${p.id}`)}
              />
            ))}
          <button
            type="button"
            disabled={team.players.length >= MAX_SQUAD}
            onClick={() => onAddPlayer(teamIndex)}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-45"
          >
            <UserPlus size={13} />
            {t("team.addPlayer", { n: team.players.length })}
          </button>
        </div>
      )}

      {/* The kit is set once and then left alone, so it folds behind one row that still
          shows it: the shirt as it is painted, and the keeper's beside it. */}
      <button
        type="button"
        onClick={() => setKitOpen(!kitOpen)}
        aria-expanded={kitOpen}
        title={t("team.kit.title")}
        className="flex items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-white/[0.04]"
      >
        <ChevronDown size={12} className={cn("shrink-0 text-ink-400 transition-transform", !kitOpen && "-rotate-90")} />
        <span className="flex-1 text-xs text-ink-400">{t("team.kit")}</span>
        <span className="h-3.5 w-6 rounded-sm ring-1 ring-white/20" style={{ background: swatch(team.pattern ?? "solid", team.color) }} />
        {sportOf(doc).keeper && (
          <span
            className="h-3.5 w-3.5 rounded-full ring-1 ring-white/20"
            style={{ background: team.keeper?.color ?? noKit(team.color) }}
          />
        )}
      </button>
      {kitOpen && (
        <div className="flex flex-col gap-3 pl-1">
          {/* The kit: one ball for the shirt, which the pattern paints over, and one for
              the keeper, whose empty state is the team's own kit struck through. */}
          <div className="flex items-center gap-2" title={t("team.kit.title")}>
            <span className="w-16 shrink-0 text-xs text-ink-400">
              {t("team.shirt")}
            </span>
            <ColorPicker
              size="md"
              value={team.color}
              preview={swatch(team.pattern ?? "solid", team.color)}
              label={t("team.color.pick", { team: team.name })}
              optionLabel={(c) => t("team.colorAria", { team: team.name, color: c })}
              onChange={(c) => c && patch({ color: c, textColor: contrastOn(c) })}
            />
            <div className="flex flex-1 gap-1.5">
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

          {sportOf(doc).keeper && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-400">{t("team.keeperKit")}</span>
              <ColorPicker
                size="md"
                value={team.keeper?.color ?? null}
                label={t("team.keeper.pick", { team: team.name })}
                optionLabel={(c) => t("team.keeperColorAria", { team: team.name, color: c })}
                none={{
                  label: t("team.keeperNone"),
                  title: t("team.keeperNoneAria", { team: team.name }),
                  preview: noKit(team.color),
                }}
                onChange={(c) =>
                  patch({ keeper: c ? { ...team.keeper, color: c, textColor: contrastOn(c) } : undefined })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One player in the squad list: his token, which selects him, then his name and shirt. */
function SquadRow({
  doc,
  player,
  color,
  textColor,
  selected,
  onSelect,
  onRename,
  onRenumber,
}: {
  doc: BoardDoc;
  player: Player;
  color: string;
  textColor: string;
  selected: boolean;
  onSelect: () => void;
  onRename: (label: string) => void;
  onRenumber: (number: number) => void;
}) {
  const { t } = useI18n();
  // null while the field shows the committed number rather than a draft: a number another
  // player wears is held here, in red, and never reaches the document.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(player.number);
  const wanted = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(wanted) && wanted >= 0 && wanted <= 99;
  const clash = valid ? shirtClash(doc, player.id, wanted) : null;

  /** The next shirt along that nobody else on the team wears, or null at the end. */
  const nextFree = (direction: 1 | -1): number | null => {
    for (let n = player.number + direction; n >= 0 && n <= 99; n += direction) {
      if (!shirtClash(doc, player.id, n)) return n;
    }
    return null;
  };
  const step = (direction: 1 | -1) => {
    const n = nextFree(direction);
    if (n === null) return;
    setDraft(null);
    onRenumber(n);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md py-0.5 pl-0.5 pr-1 transition",
        selected ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-white/[0.03]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={t("team.squad.select", { number: player.number })}
        title={t("team.squad.select", { number: player.number })}
        className="flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold ring-1 ring-white/25 transition hover:ring-accent"
        style={{ background: color, color: textColor }}
      >
        {player.number}
      </button>
      <input
        value={player.label}
        onChange={(e) => onRename(e.target.value)}
        placeholder={t("inspect.playerPlaceholder", { number: player.number })}
        aria-label={t("inspect.name")}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink-200 outline-none transition placeholder:text-ink-500 hover:border-ink-600 focus:border-accent focus:bg-ink-900"
      />
      <span
        className={cn(
          "flex shrink-0 items-stretch overflow-hidden rounded border transition",
          clash
            ? "border-red-500/70"
            : "border-transparent hover:border-ink-600 focus-within:border-accent focus-within:bg-ink-900",
        )}
      >
        <input
          type="text"
          inputMode="numeric"
          value={text}
          aria-label={t("inspect.number")}
          aria-invalid={clash !== null}
          title={clash ? t("inspect.clash", { who: clash.label || `#${clash.number}`, number: wanted }) : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 99 && !shirtClash(doc, player.id, n)) {
              onRenumber(n);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          }}
          onBlur={() => setDraft(null)}
          className={cn(
            "w-7 bg-transparent py-0.5 text-center font-mono text-xs outline-none",
            clash ? "text-red-300" : "text-ink-300",
          )}
        />
        <Stepper
          upLabel={t("field.increase", { label: t("inspect.number") })}
          downLabel={t("field.decrease", { label: t("inspect.number") })}
          upDisabled={nextFree(1) === null}
          downDisabled={nextFree(-1) === null}
          onUp={() => step(1)}
          onDown={() => step(-1)}
        />
      </span>
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

/** "No keeper's kit": the team's own colour, struck through. */
function noKit(color: string): string {
  return `linear-gradient(135deg, ${color} 0 44%, rgba(255,255,255,0.85) 44% 56%, ${color} 56%)`;
}
