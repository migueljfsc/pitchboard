import type { BoardDoc } from "@/board/types";
import { FORMATIONS, FORMATION_GROUPS, type Direction } from "@/formations";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  onDocChange: (next: BoardDoc) => void;
  formations: [string, string];
  onFormationChange: (teamIndex: 0 | 1, formation: string) => void;
  directions: [Direction, Direction];
};

const SWATCHES = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#f8fafc", "#18181b"];

export function Toolbar({ doc, onDocChange, formations, onFormationChange, directions }: Props) {
  const setColor = (teamIndex: 0 | 1, color: string) => {
    const teams = doc.teams.slice() as BoardDoc["teams"];
    teams[teamIndex] = { ...teams[teamIndex], color, textColor: contrastOn(color) };
    onDocChange({ ...doc, teams });
  };

  const setName = (teamIndex: 0 | 1, name: string) => {
    const teams = doc.teams.slice() as BoardDoc["teams"];
    teams[teamIndex] = { ...teams[teamIndex], name };
    onDocChange({ ...doc, teams });
  };

  return (
    <div className="flex flex-col gap-6">
      {([0, 1] as const).map((i) => (
        <section key={doc.teams[i].id} className="flex flex-col gap-3">
          <header className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full ring-1 ring-white/20"
              style={{ background: doc.teams[i].color }}
            />
            <input
              value={doc.teams[i].name}
              onChange={(e) => setName(i, e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-ink-200 outline-none focus:text-white"
            />
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
              {directions[i] === "left" ? "→" : "←"}
            </span>
          </header>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Formation</span>
            <select
              value={formations[i]}
              onChange={(e) => onFormationChange(i, e.target.value)}
              className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-sm text-ink-200 outline-none focus:border-accent"
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
                aria-label={`Set ${doc.teams[i].name} colour to ${c}`}
                onClick={() => setColor(i, c)}
                className={cn(
                  "size-5 rounded-full ring-1 transition",
                  doc.teams[i].color === c ? "ring-2 ring-accent" : "ring-white/15 hover:ring-white/40",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </section>
      ))}
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
