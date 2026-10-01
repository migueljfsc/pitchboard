import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronUp,
  Ghost,
  GripHorizontal,
  PanelLeft,
  PanelRight,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import type { BoardDoc, Grass, PitchHalf, PitchView } from "@/board/types";
import { framingOf } from "@/board/projection";
import { ViewControls, type Ghosts } from "@/components/ViewControls";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";
import { cn } from "@/lib/utils";
import { VIEW_BAR_HOME, loadViewBar, saveViewBar, type ViewBarPlace } from "@/share/viewBar";

type Props = {
  view: PitchView;
  onChange: (view: PitchView) => void;
  doc: BoardDoc;
  onTokenScaleChange: (scale: number) => void;
  onGrassChange: (grass: Grass | undefined) => void;
  ghosts: Ghosts;
  onGhostsChange: (ghosts: Ghosts) => void;
};

/** The crops, as icons, named for where they are on screen (see `ViewControls`'s `HALVES`). */
const HALVES: { value: PitchHalf; icon: typeof Square; flat: MessageKey; upright: MessageKey }[] = [
  { value: "left", icon: PanelLeft, flat: "view.left", upright: "view.bottom" },
  { value: "full", icon: Square, flat: "view.full", upright: "view.full" },
  { value: "right", icon: PanelRight, flat: "view.right", upright: "view.top" },
];

/**
 * How the board is being looked at, on the board itself: flat or 3D, its turn, the crop and the
 * ghosts of the scenes either side — controls whose effect is right beside them. How the board
 * LOOKS (player size, the surface) is set once and lives one click further, in a popover.
 *
 * It floats, so it must never be in the way: dragged by its grip anywhere inside the board,
 * folded down to the grip and a button, and put back where it started by the small button on its
 * corner. Where it is, and whether it is folded, are this browser's (`share/viewBar.ts`).
 */
export function BoardViewBar({ view, onChange, doc, onTokenScaleChange, onGrassChange, ghosts, onGhostsChange }: Props) {
  const { t } = useI18n();
  const framing = framingOf(view);
  const [lookOpen, setLookOpen] = useState(false);
  const [place, setPlace] = useState<ViewBarPlace>(() => loadViewBar());
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  // The free space the bar can move in: the board's box less the bar's own size.
  const [room, setRoom] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const box = area.current;
    const bar = root.current;
    if (!box || !bar) return;
    const measure = () =>
      setRoom({
        x: Math.max(0, box.clientWidth - bar.offsetWidth),
        y: Math.max(0, box.clientHeight - bar.offsetHeight),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const keep = (next: ViewBarPlace) => {
    setPlace(next);
    saveViewBar(next);
  };

  useEffect(() => {
    if (!lookOpen) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setLookOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setLookOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [lookOpen]);

  /** Dragged by the grip: the pointer is captured, so the board under it never sees the drag. */
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    setDragging(true);
    const from = { x: e.clientX, y: e.clientY, left: place.x * room.x, top: place.y * room.y };
    let latest = place;
    const move = (ev: PointerEvent) => {
      const left = Math.min(Math.max(from.left + ev.clientX - from.x, 0), room.x);
      const top = Math.min(Math.max(from.top + ev.clientY - from.y, 0), room.y);
      latest = { ...place, x: room.x ? left / room.x : 0, y: room.y ? top / room.y : 0 };
      setPlace(latest);
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      setDragging(false);
      saveViewBar(latest);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  };

  const away = place.x !== VIEW_BAR_HOME.x || place.y !== VIEW_BAR_HOME.y || place.collapsed;
  // The popover opens towards the middle of the board: right of a bar on the left half, left of
  // one on the right; and upwards from one low down, so it stays on the board.
  const leftward = place.x > 0.5;
  const upward = place.y > 0.6;

  return (
    // The box the bar moves in: the board, a little in from its edges. Clicks pass through it.
    <div ref={area} className="pointer-events-none absolute inset-3 z-10">
      <div
        ref={root}
        className="pointer-events-auto absolute"
        style={{ left: place.x * room.x, top: place.y * room.y }}
      >
        <div
          data-tour="view"
          className="relative flex w-10 flex-col items-center gap-0.5 rounded-xl border border-ink-600 bg-ink-800/90 p-1 shadow-lg shadow-black/30 backdrop-blur"
        >
          {/* The cursor is set here, not by a class: the stylesheet gives every button a pointer,
              and that rule would win over a utility's grab. */}
          <button
            type="button"
            onPointerDown={startDrag}
            aria-label={t("viewbar.move")}
            title={t("viewbar.move")}
            style={{ cursor: dragging ? "grabbing" : "grab" }}
            className="flex h-4 w-7 touch-none items-center justify-center rounded text-ink-500 transition hover:text-ink-200"
          >
            <GripHorizontal size={13} />
          </button>

          {!place.collapsed && (
            <>
              <Well>
                <Pill active={!view.tilt} onClick={() => onChange({ ...view, tilt: false })} label={t("view.flat")}>
                  <span className="text-[10px] font-semibold">2D</span>
                </Pill>
                <Pill active={!!view.tilt} onClick={() => onChange({ ...view, tilt: true })} label={t("view.3d")}>
                  <Box size={13} />
                </Pill>
              </Well>
              <Pill
                active={framing.rotated && !view.tilt}
                disabled={view.tilt}
                onClick={() => onChange({ ...view, rotated: !view.rotated })}
                label={t(framing.rotated ? "view.vertical" : "view.horizontal")}
              >
                <RotateCw size={13} />
              </Pill>

              <Divider />
              <Well>
                {HALVES.map(({ value, icon: Icon, flat, upright }) => (
                  <Pill
                    key={value}
                    active={view.half === value}
                    onClick={() => onChange({ ...view, half: value })}
                    label={t(framing.rotated ? upright : flat)}
                  >
                    <Icon size={13} className={cn(framing.rotated && value !== "full" && "-rotate-90")} />
                  </Pill>
                ))}
              </Well>

              <Divider />
              <Pill
                active={ghosts.before}
                onClick={() => onGhostsChange({ ...ghosts, before: !ghosts.before })}
                label={`${t("view.ghostsShort")}: ${t("view.ghosts.before")}`}
                tall
              >
                <Ghost size={13} />
                <span className="font-mono text-[9px] leading-none">−1</span>
              </Pill>
              <Pill
                active={ghosts.after}
                onClick={() => onGhostsChange({ ...ghosts, after: !ghosts.after })}
                label={`${t("view.ghostsShort")}: ${t("view.ghosts.after")}`}
                tall
              >
                <Ghost size={13} />
                <span className="font-mono text-[9px] leading-none">+1</span>
              </Pill>

              <Divider />
              {/* The popover hangs off the button that opened it, not off the top of the bar. */}
              <span className="relative">
                <Pill active={lookOpen} onClick={() => setLookOpen(!lookOpen)} label={t("section.view")}>
                  <SlidersHorizontal size={13} />
                </Pill>
              {lookOpen && (
                <div
                  className={cn(
                    "absolute w-64 animate-pop-in rounded-xl border border-ink-600 bg-ink-800/95 p-3 shadow-xl shadow-black/40 backdrop-blur",
                    leftward ? "right-full mr-2.5" : "left-full ml-2.5",
                    upward ? "bottom-0" : "top-0",
                  )}
                >
                  <ViewControls
                    view={view}
                    onChange={onChange}
                    doc={doc}
                    onTokenScaleChange={onTokenScaleChange}
                    onGrassChange={onGrassChange}
                    only="look"
                  />
                </div>
              )}
              </span>
            </>
          )}

          <Pill
            active={false}
            onClick={() => {
              setLookOpen(false);
              keep({ ...place, collapsed: !place.collapsed });
            }}
            label={t(place.collapsed ? "viewbar.expand" : "viewbar.collapse")}
          >
            {place.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </Pill>

          {/* Back where it started, unfolded: only offered once it has been moved or folded. */}
          {away && (
            <button
              type="button"
              onClick={() => keep(VIEW_BAR_HOME)}
              aria-label={t("viewbar.reset")}
              title={t("viewbar.reset")}
              className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-ink-400 shadow transition hover:border-accent hover:text-accent"
            >
              <RotateCcw size={9} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

/** A set of pills only one of which is ever on, sunk into the bar so it reads as one choice. */
function Well({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5 rounded-lg bg-ink-900/80 p-0.5">{children}</div>;
}

function Pill({
  active,
  disabled,
  onClick,
  label,
  tall = false,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  /** Room for a line of text under the icon. */
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex w-7 flex-col items-center justify-center gap-0.5 rounded-lg transition disabled:opacity-35",
        tall ? "h-9" : "h-7",
        active ? "bg-accent text-ink-900" : "text-ink-300 enabled:hover:bg-white/[0.07] enabled:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="my-0.5 h-px w-5 bg-ink-600" />;
