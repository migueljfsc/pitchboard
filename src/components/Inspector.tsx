import type { BoardDoc } from "@/board/types";
import { BALL_ID } from "@/board/types";

type Props = {
  doc: BoardDoc;
  selection: ReadonlySet<string>;
  activeScene: number;
  canEditPaths: boolean;
  onNudge: (metres: number, axis: "x" | "y") => void;
  onClear: () => void;
  onCarrierChange: (playerId: string | null) => void;
  onClearPaths: () => void;
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
}: Props) {
  const scene = doc.scenes[activeScene];
  const nameOf = (id: string) => {
    if (id === BALL_ID) return "Ball";
    for (const team of doc.teams) {
      const p = team.players.find((x) => x.id === id);
      if (p) return `${team.name} ${p.number}`;
    }
    return id;
  };

  if (selection.size === 0) {
    return (
      <p className="text-xs leading-relaxed text-ink-400">
        Click a player to select. Shift-click to add, or drag on empty grass to marquee.
        Arrow keys nudge; hold shift for 5&nbsp;m. Space plays.
      </p>
    );
  }

  const players = [...selection].filter((id) => id !== BALL_ID);
  const only = players.length === 1 ? players[0] : null;
  const carries = only !== null && scene?.carrier === only;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">
          {selection.size} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
        >
          clear
        </button>
      </div>

      <p className="text-xs leading-relaxed text-ink-200">
        {[...selection].map(nameOf).join(", ")}
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">Shift line</span>
        <div className="grid grid-cols-2 gap-1.5">
          <SmallButton label="Deeper 5 m" onClick={() => onNudge(-5, "x")} />
          <SmallButton label="Higher 5 m" onClick={() => onNudge(5, "x")} />
          <SmallButton label="Left 5 m" onClick={() => onNudge(-5, "y")} />
          <SmallButton label="Right 5 m" onClick={() => onNudge(5, "y")} />
        </div>
      </div>

      {only && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">
            Ball — {scene?.name}
          </span>
          <SmallButton
            label={carries ? "Release the ball" : `Give ball to ${nameOf(only)}`}
            onClick={() => onCarrierChange(carries ? null : only)}
          />
          <p className="text-[10px] leading-relaxed text-ink-400">
            Handing the ball to a different player in the next scene makes a pass.
          </p>
        </div>
      )}

      {canEditPaths && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">Run</span>
          <SmallButton label="Straighten" onClick={onClearPaths} />
          <p className="text-[10px] leading-relaxed text-ink-400">
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
