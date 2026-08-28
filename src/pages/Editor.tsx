import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardDoc } from "@/board/types";
import { BoardCanvas } from "@/components/BoardCanvas";
import { Toolbar } from "@/components/Toolbar";
import { Inspector } from "@/components/Inspector";
import { nudgeEntities } from "@/board/interaction";
import {
  AWAY,
  HOME,
  applyFormation,
  createBoardDoc,
  type Direction,
} from "@/formations";

export function Editor() {
  const [doc, setDoc] = useState<BoardDoc>(() => createBoardDoc());
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [formations, setFormations] = useState<[string, string]>([HOME.formation, AWAY.formation]);

  const directions = useMemo<[Direction, Direction]>(() => [HOME.direction, AWAY.direction], []);
  const sceneIndex = 0;

  const onFormationChange = (teamIndex: 0 | 1, formation: string) => {
    const base = teamIndex === 0 ? HOME : AWAY;
    const team = doc.teams[teamIndex];
    setDoc(
      applyFormation(doc, teamIndex, {
        ...base,
        name: team.name,
        color: team.color,
        textColor: team.textColor,
        formation,
      }),
    );
    setFormations((f) => {
      const next = f.slice() as [string, string];
      next[teamIndex] = formation;
      return next;
    });
    setSelection(new Set());
  };

  const onNudge = useCallback(
    (metres: number, axis: "x" | "y") => {
      if (selection.size === 0) return;
      setDoc((d) => nudgeEntities(d, sceneIndex, selection, metres, axis));
    },
    [selection],
  );

  // Arrow keys nudge the selection: 1 m, or 5 m with shift.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      const step = e.shiftKey ? 5 : 1;
      const map: Record<string, [number, "x" | "y"]> = {
        ArrowUp: [-step, "y"],
        ArrowDown: [step, "y"],
        ArrowLeft: [-step, "x"],
        ArrowRight: [step, "x"],
      };
      const move = map[e.key];
      if (!move) return;
      e.preventDefault();
      onNudge(move[0], move[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNudge]);

  return (
    <div className="flex h-full w-full">
      <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-ink-700 bg-ink-800 p-4">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-white">Pitchboard</h1>
          <p className="mt-0.5 text-[11px] text-ink-400">M1 — static board</p>
        </div>

        <Toolbar
          doc={doc}
          onDocChange={setDoc}
          formations={formations}
          onFormationChange={onFormationChange}
          directions={directions}
        />

        <div className="border-t border-ink-700 pt-4">
          <Inspector
            doc={doc}
            selection={selection}
            onNudge={onNudge}
            onClear={() => setSelection(new Set())}
          />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <BoardCanvas
          doc={doc}
          t={0}
          sceneIndex={sceneIndex}
          selection={selection}
          onSelectionChange={setSelection}
          onDocChange={setDoc}
        />
      </main>
    </div>
  );
}
