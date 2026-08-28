import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Link2,
  Ruler,
  Trash2,
} from "lucide-react";
import type { BoardDoc, Link, LinkStyle } from "@/board/types";
import { deleteLink, linkColor, moveMember, updateLink } from "@/board/links";
import { PALETTE } from "@/components/ui/palette";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  onDocChange: (next: BoardDoc) => void;
  selection: ReadonlySet<string>;
  onSelectMembers: (members: string[]) => void;
  onCreateFromSelection: () => void;
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
  expanded,
  onExpandedChange,
}: Props) {
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
        {doc.links.map((link) => (
          <LinkRow
            key={link.id}
            doc={doc}
            link={link}
            expanded={expanded === link.id}
            numberOf={numberOf}
            onToggle={() => onExpandedChange(expanded === link.id ? null : link.id)}
            onSelect={() => onSelectMembers(link.members)}
            onChange={(patch) => onDocChange(updateLink(doc, link.id, patch))}
            onMove={(from, to) => onDocChange(moveMember(doc, link.id, from, to))}
            onDelete={() => onDocChange(deleteLink(doc, link.id))}
          />
        ))}
      </div>
    </div>
  );
}

function LinkRow({
  doc,
  link,
  expanded,
  numberOf,
  onToggle,
  onSelect,
  onChange,
  onMove,
  onDelete,
}: {
  doc: BoardDoc;
  link: Link;
  expanded: boolean;
  numberOf: (id: string) => number | string;
  onToggle: () => void;
  onSelect: () => void;
  onChange: (patch: Partial<Omit<Link, "id">>) => void;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border transition",
        expanded ? "border-accent bg-ink-700" : "border-ink-600",
        link.hidden && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
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
              onChange={(e) => onChange({ name: e.target.value })}
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
