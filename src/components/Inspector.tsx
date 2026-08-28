import type { BoardDoc } from "@/board/types";
import { BALL_ID } from "@/board/types";

type Props = {
  doc: BoardDoc;
  selection: ReadonlySet<string>;
  onNudge: (metres: number, axis: "x" | "y") => void;
  onClear: () => void;
};

export function Inspector({ doc, selection, onNudge, onClear }: Props) {
  const names = [...selection].map((id) => {
    if (id === BALL_ID) return "Ball";
    for (const team of doc.teams) {
      const p = team.players.find((x) => x.id === id);
      if (p) return `${team.name} ${p.number}`;
    }
    return id;
  });

  if (selection.size === 0) {
    return (
      <p className="text-xs leading-relaxed text-ink-400">
        Click a player to select. Shift-click to add, or drag on empty grass to marquee.
        Arrow keys nudge the selection; hold shift for 5&nbsp;m.
      </p>
    );
  }

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

      <p className="text-xs leading-relaxed text-ink-200">{names.join(", ")}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">Shift line</span>
        <div className="grid grid-cols-2 gap-1.5">
          <NudgeButton label="Deeper 5 m" onClick={() => onNudge(-5, "x")} />
          <NudgeButton label="Higher 5 m" onClick={() => onNudge(5, "x")} />
          <NudgeButton label="Left 5 m" onClick={() => onNudge(-5, "y")} />
          <NudgeButton label="Right 5 m" onClick={() => onNudge(5, "y")} />
        </div>
      </div>
    </div>
  );
}

function NudgeButton({ label, onClick }: { label: string; onClick: () => void }) {
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
