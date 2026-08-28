import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardDoc, PitchView } from "@/board/types";
import { DEFAULT_PITCH_VIEW } from "@/board/types";
import { BoardCanvas } from "@/components/BoardCanvas";
import { TeamControls } from "@/components/TeamControls";
import { ViewControls } from "@/components/ViewControls";
import { Section } from "@/components/ui/Section";
import { Inspector } from "@/components/Inspector";
import { LinkPanel } from "@/components/LinkPanel";
import { Timeline } from "@/components/Timeline";
import { nudgeEntities } from "@/board/interaction";
import { createLink } from "@/board/links";
import { concealedPlayers } from "@/board/render";
import { sceneStartSeconds, setCarrier, setPath, setTravel, totalSeconds } from "@/board/scenes";
import { setPlayerLabel, setPlayerNumber } from "@/board/players";
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
  const [activeScene, setActiveScene] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [pitchView, setPitchView] = useState<PitchView>(DEFAULT_PITCH_VIEW);

  const directions = useMemo<[Direction, Direction]>(() => [HOME.direction, AWAY.direction], []);
  const total = totalSeconds(doc);

  // Scene 0 has no incoming transition, so there is no run to shape there.
  const editScene = activeScene > 0 ? activeScene : undefined;

  // Players on a hidden team drop out of the selection rather than being cleared
  // from it: a nudge must not move tokens nobody can see, but unhiding the team
  // should give you your selection back.
  const visible = useMemo(() => {
    const concealed = concealedPlayers(doc);
    if (concealed.size === 0) return selection;
    return new Set([...selection].filter((id) => !concealed.has(id)));
  }, [doc, selection]);

  // Playback. Driven by wall-clock delta rather than a fixed step so the animation
  // runs at the right speed regardless of frame rate.
  const lastFrame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    lastFrame.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastFrame.current) / 1000;
      lastFrame.current = now;

      setTime((t) => {
        const next = t + dt;
        if (next < total) return next;
        if (loop) return total > 0 ? next % total : 0;
        setPlaying(false);
        return total;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, total]);

  const selectScene = useCallback(
    // `forDoc` matters when the scene list changed in the same event: React has
    // not re-rendered yet, so `doc` here is still the previous version and the
    // scrubber would land at the wrong time.
    (index: number, forDoc?: BoardDoc) => {
      setActiveScene(index);
      setPlaying(false);
      setTime(sceneStartSeconds(forDoc ?? doc, index));
    },
    [doc],
  );

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
      if (visible.size === 0) return;
      setDoc((d) => nudgeEntities(d, activeScene, visible, metres, axis));
    },
    [visible, activeScene],
  );

  const onCreateLink = () => {
    const members = [...visible].filter((id) => id !== "ball");
    if (members.length < 2) return;
    const next = createLink(doc, members);
    setDoc(next);
    // Open the new link so its style and order are immediately adjustable.
    setExpandedLink(next.links[next.links.length - 1]?.id ?? null);
  };

  const onTravelChange = (ms: number | null) => {
    if (editScene === undefined) return;
    setDoc((d) => {
      let next = d;
      for (const id of visible) next = setTravel(next, editScene, id, ms);
      return next;
    });
  };

  const onCarrierChange = (playerId: string | null) => {
    setDoc((d) => setCarrier(d, activeScene, playerId));
  };

  const onClearPaths = () => {
    if (editScene === undefined) return;
    setDoc((d) => {
      let next = d;
      for (const id of visible) next = setPath(next, editScene, id, null);
      return next;
    });
  };

  // Arrow keys nudge the selection: 1 m, or 5 m with shift. Space toggles playback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
        return;
      }

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
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-ink-700 bg-ink-800">
        <div className="border-b border-ink-700 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight text-white">Pitchboard</h1>
          <p className="mt-0.5 text-[11px] text-ink-400">Tactics board</p>
        </div>

        <Section title="View" defaultOpen={false}>
          <ViewControls view={pitchView} onChange={setPitchView} />
        </Section>

        {([0, 1] as const).map((i) => (
          <Section
            key={doc.teams[i].id}
            title={doc.teams[i].name || `Team ${i + 1}`}
            badge={doc.teams[i].hidden ? "hidden" : formations[i]}
          >
            <TeamControls
              doc={doc}
              teamIndex={i}
              onDocChange={setDoc}
              formation={formations[i]}
              onFormationChange={onFormationChange}
              direction={directions[i]}
            />
          </Section>
        ))}

        <Section title="Links" badge={String(doc.links.length)} defaultOpen={false}>
          <LinkPanel
            doc={doc}
            onDocChange={setDoc}
            selection={visible}
            onSelectMembers={(members) => setSelection(new Set(members))}
            onCreateFromSelection={onCreateLink}
            expanded={expandedLink}
            onExpandedChange={setExpandedLink}
          />
        </Section>

        <Section title="Selection" badge={visible.size ? String(visible.size) : undefined}>
          <Inspector
            doc={doc}
            selection={visible}
            activeScene={activeScene}
            canEditPaths={editScene !== undefined}
            onNudge={onNudge}
            onClear={() => setSelection(new Set())}
            onCarrierChange={onCarrierChange}
            onClearPaths={onClearPaths}
            onRename={(id, label) => setDoc((d) => setPlayerLabel(d, id, label))}
            onRenumber={(id, n) => setDoc((d) => setPlayerNumber(d, id, n))}
            onTravelChange={onTravelChange}
          />
        </Section>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <BoardCanvas
            doc={doc}
            t={time}
            sceneIndex={activeScene}
            editScene={editScene}
            pitchView={pitchView}
            selection={visible}
            onSelectionChange={setSelection}
            onDocChange={setDoc}
          />
        </div>

        <Timeline
          doc={doc}
          onDocChange={setDoc}
          activeScene={activeScene}
          onActiveSceneChange={selectScene}
          time={time}
          onTimeChange={setTime}
          playing={playing}
          onPlayingChange={setPlaying}
          loop={loop}
          onLoopChange={setLoop}
        />
      </main>
    </div>
  );
}
