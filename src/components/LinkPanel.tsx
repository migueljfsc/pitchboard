import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  Ruler,
  Trash2,
} from "lucide-react";
import type { BoardDoc, Link, LinkStyle } from "@/board/types";
import { deleteLink, linkColor, moveLink, moveMember, updateLink } from "@/board/links";
import { PALETTE } from "@/components/ui/palette";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  onDocChange: Change<BoardDoc>;
  selection: ReadonlySet<string>;
  onSelectMembers: (members: string[]) => void;
  onCreateFromSelection: () => void;
  /** Raises the confirmation; the Editor owns it, as it does the two resets. */
  onClearAll: () => void;
  expanded: string | null;
  onExpandedChange: (id: string | null) => void;
};

const STYLES: { value: LinkStyle; label: string; hint: string }[] = [
  { value: "chain", label: "Chain", hint: "Open line — a back four must not close on itself" },
  { value: "polygon", label: "Shape", hint: "Closed outline" },
  { value: "filled", label: "Filled", hint: "Closed and shaded — shows the area collapse" },
];

export function LinkPanel({
  doc,
  onDocChange,
  selection,
  onSelectMembers,
  onCreateFromSelection,
  onClearAll,
  expanded,
  onExpandedChange,
}: Props) {
  // Which row is in the air, and which GAP it would drop into — 0 is above the
  // first row, n below the last. A gap says where the row lands; highlighting a
  // row only says which one it lands near. Both are presentation: the reorder
  // reaches the document on drop.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const players = [...selection].filter((id) => id !== "ball");
  const numberOf = (id: string) => {
    for (const team of doc.teams) {
      const p = team.players.find((x) => x.id === id);
      if (p) return p.number;
    }
    return "?";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">
          Links ({doc.links.length})
        </span>
        {doc.links.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            title="Delete every link on the board"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-ink-400 transition hover:text-red-400"
          >
            <Trash2 size={11} />
            Delete all
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={players.length < 2}
        onClick={onCreateFromSelection}
        className="flex items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-ink-200 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-45"
      >
        <Link2 size={13} />
        {players.length < 2 ? "Select 2+ players to link" : `Link ${players.length} players`}
      </button>

      <div className="flex flex-col gap-1.5">
        {doc.links.map((link, i) => (
          <LinkRow
            key={link.id}
            doc={doc}
            link={link}
            index={i}
            count={doc.links.length}
            dragging={dragging === i}
            dropBefore={dropAt === i}
            dropAfter={dropAt === doc.links.length && i === doc.links.length - 1}
            expanded={expanded === link.id}
            numberOf={numberOf}
            onToggle={() => onExpandedChange(expanded === link.id ? null : link.id)}
            onSelect={() => onSelectMembers(link.members)}
            onChange={(patch, merge) => onDocChange(updateLink(doc, link.id, patch), merge)}
            onMove={(from, to) => onDocChange(moveMember(doc, link.id, from, to))}
            onDelete={() => onDocChange(deleteLink(doc, link.id))}
            onReorder={(to) => onDocChange(moveLink(doc, i, to))}
            onDragStart={() => setDragging(i)}
            onDragOver={setDropAt}
            onDrop={() => {
              // The gap index counts positions in the list as it stands; once
              // the dragged row is lifted out, everything below it shifts up.
              if (dragging !== null && dropAt !== null) {
                onDocChange(moveLink(doc, dragging, dropAt > dragging ? dropAt - 1 : dropAt));
              }
              setDragging(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropAt(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function LinkRow({
  doc,
  link,
  index,
  count,
  dragging,
  dropBefore,
  dropAfter,
  expanded,
  numberOf,
  onToggle,
  onSelect,
  onChange,
  onMove,
  onDelete,
  onReorder,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  doc: BoardDoc;
  link: Link;
  index: number;
  count: number;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  expanded: boolean;
  numberOf: (id: string) => number | string;
  onToggle: () => void;
  onSelect: () => void;
  onChange: (patch: Partial<Omit<Link, "id">>, merge?: string) => void;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
  onReorder: (to: number) => void;
  onDragStart: () => void;
  onDragOver: (gap: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        // Above the midpoint drops before this row, below it drops after.
        const box = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY < box.top + box.height / 2 ? index : index + 1);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "relative rounded-md border transition",
        expanded ? "border-accent bg-ink-700" : "border-ink-600",
        link.hidden && "opacity-50",
        dragging && "opacity-40",
      )}
    >
      {/* Sits in the gap between rows, so it marks a position rather than an
          object. Absolute, so nothing reflows while dragging over it. */}
      {dropBefore && <DropLine className="-top-1" />}
      {dropAfter && <DropLine className="-bottom-1" />}

      <div className="flex items-center gap-1 px-1.5 py-1.5">
        {/* Document order is draw order, so this reorders the stack too. */}
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            // Firefox refuses to start a drag without payload.
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", link.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : null;
            if (to === null || to < 0 || to >= count) return;
            e.preventDefault();
            // The editor nudges the selection on arrow keys from a window
            // listener; stopping here keeps reordering from moving players.
            e.stopPropagation();
            onReorder(to);
          }}
          aria-label={`Reorder ${link.name}`}
          title="Drag to reorder, or focus and use the arrow keys. Later links draw on top."
          className="flex size-4 shrink-0 cursor-grab items-center justify-center rounded text-ink-500 transition hover:text-ink-200 focus:outline-none focus-visible:text-accent active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </button>
        {/* An explicit chevron, because renaming was undiscoverable behind the dot. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Close" : "Rename and restyle"} ${link.name}`}
          title="Rename, restyle, reorder"
          className="flex size-5 shrink-0 items-center justify-center rounded text-ink-400 transition hover:text-accent"
        >
          <ChevronDown size={13} className={cn("transition-transform", !expanded && "-rotate-90")} />
        </button>
        <span
          className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25"
          style={{ background: linkColor(doc, link) }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 truncate text-left text-xs text-ink-200 hover:text-white"
          title="Rename, restyle, reorder"
        >
          {link.name}
        </button>
        <Tiny
          label={link.showDistances ? "Hide distances" : "Show distances"}
          active={link.showDistances}
          onClick={() => onChange({ showDistances: !link.showDistances })}
        >
          <Ruler size={12} />
        </Tiny>
        <Tiny
          label={link.hidden ? "Show link" : "Hide link"}
          onClick={() => onChange({ hidden: !link.hidden })}
        >
          {link.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </Tiny>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-ink-600 px-2 py-2">
          <button
            type="button"
            onClick={onSelect}
            className="rounded border border-ink-600 bg-ink-800 px-1.5 py-1 text-[11px] text-ink-200 transition hover:border-accent hover:text-white"
          >
            Select {link.members.length} players
          </button>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Name</span>
            <input
              value={link.name}
              onChange={(e) => onChange({ name: e.target.value }, `link-name:${link.id}`)}
              className="w-full rounded border border-ink-600 bg-ink-900 px-1.5 py-1 text-[11px] text-ink-200 outline-none transition hover:border-ink-400 focus:border-accent"
              aria-label="Link name"
            />
          </label>

          <div className="flex gap-1">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                title={s.hint}
                onClick={() => onChange({ style: s.value })}
                className={cn(
                  "flex-1 rounded border px-1 py-1 text-[11px] transition",
                  link.style === s.value
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-400 hover:text-ink-200",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wide text-ink-400">Colour</span>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {/* Auto is the default: the link tracks its members' kit, so
                  recolouring the team recolours the link with it. */}
              <button
                type="button"
                onClick={() => onChange({ color: undefined })}
                title="Follow the team's kit colour"
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] transition",
                  link.color === undefined
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-400 hover:text-ink-200",
                )}
              >
                Auto
              </button>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Set ${link.name} colour to ${c}`}
                  onClick={() => onChange({ color: c })}
                  className={cn(
                    "size-4 rounded-full ring-1 transition",
                    link.color === c ? "ring-2 ring-accent" : "ring-white/15 hover:ring-white/40",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wide text-ink-400">
              Order
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {link.members.map((id, i) => (
                <span
                  key={id}
                  className="flex items-center gap-0.5 rounded border border-ink-600 bg-ink-900 pl-1.5 text-[11px] text-ink-200"
                >
                  {numberOf(id)}
                  <button
                    type="button"
                    aria-label={`Move ${numberOf(id)} earlier`}
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                    className="px-0.5 text-ink-400 enabled:hover:text-accent disabled:opacity-45"
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${numberOf(id)} later`}
                    disabled={i === link.members.length - 1}
                    onClick={() => onMove(i, i + 1)}
                    className="pr-1 text-ink-400 enabled:hover:text-accent disabled:opacity-45"
                  >
                    <ChevronRight size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-1 rounded border border-ink-600 px-1.5 py-1 text-[11px] text-ink-400 transition hover:border-red-500/60 hover:text-red-400"
          >
            <Trash2 size={11} /> Delete link
          </button>
        </div>
      )}
    </div>
  );
}

function DropLine({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-accent",
        className,
      )}
    />
  );
}

function Tiny({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded transition",
        active ? "text-accent" : "text-ink-400 hover:text-ink-200",
      )}
    >
      {children}
    </button>
  );
}
