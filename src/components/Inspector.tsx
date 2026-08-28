import { useEffect, useRef } from "react";
import { UserMinus } from "lucide-react";
import type { BoardDoc } from "@/board/types";
import { BALL_ID } from "@/board/types";
import { displayName } from "@/board/players";
import { entityTravelMs, sceneTravelMs } from "@/board/timeline";

type Props = {
  doc: BoardDoc;
  selection: ReadonlySet<string>;
  activeScene: number;
  canEditPaths: boolean;
  onNudge: (metres: number, axis: "x" | "y") => void;
  onClear: () => void;
  onCarrierChange: (playerId: string | null) => void;
  onClearPaths: () => void;
  onRename: (playerId: string, label: string) => void;
  onRenumber: (playerId: string, number: number) => void;
  onTravelChange: (ms: number | null) => void;
  onRemovePlayer: (playerId: string) => void;
  /**
   * Bumped to put the cursor in the name field — a double-click on the board.
   * A counter rather than a boolean so renaming the same player twice in a row
   * still fires.
   */
  focusName?: number;
};

export function Inspector({
  doc,
  selection,
  activeScene,
  canEditPaths,
  onNudge,
  onClear,
  onCarrierChange,
  onClearPaths,
  onRename,
  onRenumber,
  onTravelChange,
  onRemovePlayer,
  focusName,
}: Props) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusName) return;
    // Focusing also scrolls the sidebar to it, which matters when the board is
    // tall enough to push the panel out of view.
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [focusName]);

  const scene = doc.scenes[activeScene];
  const nameOf = (id: string) => {
    if (id === BALL_ID) return "Ball";
    for (const team of doc.teams) {
      const p = team.players.find((x) => x.id === id);
      if (p) return `${team.name} ${displayName(doc, id)}`;
    }
    return id;
  };

  if (selection.size === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-ink-300">
        Click a player to select, double-click to rename. Shift-click to add, or drag on
        empty grass to marquee. Arrow keys nudge; hold shift for 5&nbsp;m. Space plays.
      </p>
    );
  }

  const players = [...selection].filter((id) => id !== BALL_ID);
  const only = players.length === 1 ? players[0] : null;
  const player = only ? doc.teams.flatMap((t) => t.players).find((p) => p.id === only) : null;
  const carries = only !== null && scene?.carrier === only;

  // Travel time is per-entity; a mixed selection shows the scene default.
  const sceneMs = scene?.transitionMs ?? 0;
  const ownMs = only && scene ? entityTravelMs(scene, only) : sceneMs;
  const overridden = only !== null && scene?.travel?.[only] !== undefined;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">
          {selection.size} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-ink-300 underline-offset-2 hover:text-white hover:underline"
        >
          clear
        </button>
      </div>

      {player ? (
        <div className="flex gap-1.5">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Name</span>
            <input
              ref={nameRef}
              value={player.label}
              onChange={(e) => onRename(player.id, e.target.value)}
              placeholder={`Player ${player.number}`}
              className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent"
            />
          </label>
          <label className="flex w-14 shrink-0 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">No.</span>
            <input
              type="number"
              min={0}
              max={99}
              value={player.number}
              onChange={(e) => onRenumber(player.id, Number(e.target.value))}
              className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-xs text-ink-200 outline-none transition hover:border-ink-400 focus:border-accent"
            />
          </label>
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {[...selection].map(nameOf).join(", ")}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">Shift line</span>
        <div className="grid grid-cols-2 gap-1.5">
          <SmallButton label="Deeper 5 m" onClick={() => onNudge(-5, "x")} />
          <SmallButton label="Higher 5 m" onClick={() => onNudge(5, "x")} />
          <SmallButton label="Left 5 m" onClick={() => onNudge(-5, "y")} />
          <SmallButton label="Right 5 m" onClick={() => onNudge(5, "y")} />
        </div>
      </div>

      {canEditPaths && scene && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Travel time</span>
            {overridden && (
              <button
                type="button"
                onClick={() => onTravelChange(null)}
                className="text-[11px] text-ink-300 underline-offset-2 hover:text-white hover:underline"
              >
                match scene
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={60}
              step={0.1}
              value={(ownMs / 1000).toFixed(1)}
              onChange={(e) => onTravelChange(Number(e.target.value) * 1000)}
              className="w-16 rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-xs text-ink-200 outline-none transition hover:border-ink-400 focus:border-accent"
            />
            <span className="text-[11px] text-ink-400">
              s{overridden ? "" : ` — scene default`}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-300">
            Shorter than the scene means this player arrives early and waits. Longer stretches
            the whole scene, which now runs for {(sceneTravelMs(scene) / 1000).toFixed(1)}&nbsp;s.
          </p>
        </div>
      )}

      {only && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            Ball — {scene?.name}
          </span>
          <SmallButton
            label={carries ? "Release the ball" : `Give ball to ${nameOf(only)}`}
            onClick={() => onCarrierChange(carries ? null : only)}
          />
          <p className="text-[11px] leading-relaxed text-ink-300">
            Handing the ball to a different player in the next scene makes a pass.
          </p>
        </div>
      )}

      {player && (
        <button
          type="button"
          onClick={() => onRemovePlayer(player.id)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-ink-600 px-2 py-1.5 text-xs text-ink-300 transition hover:border-red-500/60 hover:text-red-400"
        >
          <UserMinus size={13} />
          Remove {displayName(doc, player.id)}
        </button>
      )}

      {canEditPaths && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">Run</span>
          <SmallButton label="Straighten" onClick={onClearPaths} />
          <p className="text-[11px] leading-relaxed text-ink-300">
            Drag the amber handles on a selected player's run to curve it.
          </p>
        </div>
      )}
    </div>
  );
}

function SmallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-200 transition hover:border-accent hover:text-white"
    >
      {label}
    </button>
  );
}
