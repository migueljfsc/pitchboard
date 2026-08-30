import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  EyeOff,
  GripVertical,
  Link2,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import type { BoardDoc, Link, LinkStyle } from "@/board/types";
import {
  MAX_MEMBERS,
  MIN_MEMBERS,
  addMembers,
  deleteLink,
  linkColor,
  moveLink,
  moveMember,
  removeMember,
  updateLink,
} from "@/board/links";
import { PALETTE } from "@/components/ui/palette";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import type { I18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";

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

const STYLES: { value: LinkStyle }[] = [
  { value: "chain" },
  { value: "polygon" },
  { value: "filled" },
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
  const i18n = useI18n();
  const { t } = i18n;
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
          {t("links.count", { n: doc.links.length })}
        </span>
        {doc.links.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            title={t("links.deleteAll.title")}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-ink-400 transition hover:text-red-400"
          >
            <Trash2 size={11} />
            {t("links.deleteAll")}
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
        {players.length < 2 ? t("links.needTwo") : t("links.linkPlayers", { n: players.length })}
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
            // Only players the link does not already hold, and never the ball.
            addable={players.filter((id) => !link.members.includes(id))}
            onAdd={(ids) => onDocChange(addMembers(doc, link.id, ids))}
            onRemoveMember={(id) => onDocChange(removeMember(doc, link.id, id))}
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
            i18n={i18n}
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
  addable,
  onAdd,
  onRemoveMember,
  onDelete,
  onReorder,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  i18n,
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
  /** Selected players this link does not hold yet — what "add" would add. */
  addable: string[];
  onAdd: (ids: string[]) => void;
  onRemoveMember: (id: string) => void;
  onDelete: () => void;
  onReorder: (to: number) => void;
  onDragStart: () => void;
  onDragOver: (gap: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  i18n: I18n;
}) {
  const { t } = i18n;
  // Which member chip is in the air, and which GAP it would land in — 0 before the
  // first, n after the last. Local, because only one row is expanded at a time.
  const [lift, setLift] = useState<number | null>(null);
  const [gap, setGap] = useState<number | null>(null);

  const dropMember = () => {
    // The gap counts positions in the list as it stands; once the chip is lifted
    // out, everything after it shifts down one.
    if (lift !== null && gap !== null && gap !== lift && gap !== lift + 1) {
      onMove(lift, gap > lift ? gap - 1 : gap);
    }
    setLift(null);
    setGap(null);
  };

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
          aria-label={t("links.reorder", { name: link.name })}
          title={t("links.reorder.title")}
          className="flex size-4 shrink-0 cursor-grab items-center justify-center rounded text-ink-500 transition hover:text-ink-200 focus:outline-none focus-visible:text-accent active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </button>
        {/* An explicit chevron, because renaming was undiscoverable behind the dot. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={t(expanded ? "links.collapseRow" : "links.expandRow", { name: link.name })}
          title={t("links.edit.title")}
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
          title={t("links.edit.title")}
        >
          {link.name}
        </button>
        <Tiny
          label={t(link.showDistances ? "links.hideDistances" : "links.showDistances")}
          active={link.showDistances}
          onClick={() => onChange({ showDistances: !link.showDistances })}
        >
          <Ruler size={12} />
        </Tiny>
        <Tiny
          label={t(link.hidden ? "links.show" : "links.hide")}
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
            {t("links.selectMembers", { n: link.members.length })}
          </button>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("links.name")}</span>
            <input
              value={link.name}
              onChange={(e) => onChange({ name: e.target.value }, `link-name:${link.id}`)}
              className="w-full rounded border border-ink-600 bg-ink-900 px-1.5 py-1 text-[11px] text-ink-200 outline-none transition hover:border-ink-400 focus:border-accent"
              aria-label={t("links.name.label")}
            />
          </label>

          <div className="flex gap-1">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                title={t(`links.style.${s.value}.hint` as MessageKey)}
                onClick={() => onChange({ style: s.value })}
                className={cn(
                  "flex-1 rounded border px-1 py-1 text-[11px] transition",
                  link.style === s.value
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-400 hover:text-ink-200",
                )}
              >
                {t(`links.style.${s.value}` as MessageKey)}
              </button>
            ))}
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("links.colour")}</span>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {/* Auto is the default: the link tracks its members' kit, so
                  recolouring the team recolours the link with it. */}
              <button
                type="button"
                onClick={() => onChange({ color: undefined })}
                title={t("links.auto.title")}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] transition",
                  link.color === undefined
                    ? "border-accent text-accent"
                    : "border-ink-600 text-ink-400 hover:text-ink-200",
                )}
              >
                {t("links.auto")}
              </button>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t("links.colorAria", { name: link.name, color: c })}
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
              {t("links.members")}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {link.members.map((id, i) => (
                <span
                  key={id}
                  draggable
                  title={t("links.dragMember")}
                  onDragStart={(e) => {
                    // Firefox refuses to start a drag without payload.
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                    setLift(i);
                  }}
                  onDragEnd={() => {
                    setLift(null);
                    setGap(null);
                  }}
                  // Only while a chip is in the air. A link ROW dragged over this
                  // one must keep bubbling to the row's own handler, or it loses
                  // its drop marker over anything expanded.
                  onDragOver={(e) => {
                    if (lift === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const box = e.currentTarget.getBoundingClientRect();
                    setGap(e.clientX < box.left + box.width / 2 ? i : i + 1);
                  }}
                  onDrop={(e) => {
                    if (lift === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    dropMember();
                  }}
                  className={cn(
                    "relative flex cursor-grab items-center gap-0.5 rounded border border-ink-600 bg-ink-900 pl-1.5 text-[11px] text-ink-200 active:cursor-grabbing",
                    lift === i && "opacity-40",
                  )}
                >
                  {/* In the gap between chips, so it marks a position rather than
                      a chip. Absolute, so nothing reflows mid-drag. */}
                  {gap === i && <DropBar className="-left-1" />}
                  {gap === link.members.length && i === link.members.length - 1 && (
                    <DropBar className="-right-1" />
                  )}
                  {numberOf(id)}
                  <button
                    type="button"
                    aria-label={t("links.moveEarlier", { number: numberOf(id) })}
                    title={t("links.moveEarlier", { number: numberOf(id) })}
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                    className="px-0.5 text-ink-400 enabled:hover:text-accent disabled:opacity-45"
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("links.moveLater", { number: numberOf(id) })}
                    title={t("links.moveLater", { number: numberOf(id) })}
                    disabled={i === link.members.length - 1}
                    onClick={() => onMove(i, i + 1)}
                    className="px-0.5 text-ink-400 enabled:hover:text-accent disabled:opacity-45"
                  >
                    <ChevronRight size={11} />
                  </button>
                  {/* Refused at two, where the link would have no edge left to
                      draw. Deleting the link is its own button below. */}
                  <button
                    type="button"
                    aria-label={t("links.removeMember", { number: numberOf(id) })}
                    title={t(
                      link.members.length > MIN_MEMBERS
                        ? "links.removeMember.title"
                        : "links.removeMember.min",
                    )}
                    disabled={link.members.length <= MIN_MEMBERS}
                    onClick={() => onRemoveMember(id)}
                    className="pr-1 text-ink-400 enabled:hover:text-red-400 disabled:opacity-45"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>

            {/* Same gesture that made the link in the first place: pick players on
                the board, then say where they go. */}
            <button
              type="button"
              disabled={addable.length === 0 || link.members.length >= MAX_MEMBERS}
              onClick={() => onAdd(addable)}
              title={t("links.addSelected.title")}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-ink-600 bg-ink-800 px-1.5 py-1 text-[11px] text-ink-200 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-45"
            >
              <Plus size={11} />
              {addable.length > 0
                ? t("links.addSelected", { n: addable.length })
                : t("links.addSelected.none")}
            </button>
          </div>

          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-1 rounded border border-ink-600 px-1.5 py-1 text-[11px] text-ink-400 transition hover:border-red-500/60 hover:text-red-400"
          >
            <Trash2 size={11} /> {t("links.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The members wrap horizontally, so their drop marker stands on end. */
function DropBar({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-accent",
        className,
      )}
    />
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
