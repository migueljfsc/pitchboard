import { useState } from "react";
import { ChevronDown, Copy, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import type { Annotation, BoardDoc, Scene } from "@/board/types";
import {
  annotationsOf,
  deleteAnnotation,
  reorderAnnotation,
  sceneRange,
  updateAnnotation,
} from "@/board/annotations";
import { KIND_ICON, KIND_KEY, describeAnnotation } from "@/components/ui/kinds";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import type { I18n } from "@/i18n/context";

type Props = {
  doc: BoardDoc;
  onDocChange: Change<BoardDoc>;
  /** Scene the board is showing, for the filter and for dimming. */
  sceneIndex: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Copies the shape and selects the copy — the same call the Draw panel makes. */
  onDuplicate: (id: string) => void;
};

/** One shape, with where it sits in the document and which scenes it spans. */
type Entry = { ann: Annotation; docIndex: number; range: [number, number] };

/** A drag in progress: which group it started in, and where in that group. */
type Lift = { group: number; pos: number; docIndex: number };

/**
 * Every shape on the board, grouped by the scene it starts on.
 *
 * The canvas can only ever show the drawing for the scene it is on, so a shape
 * ranged to scene 4 is invisible and unfindable from scene 1. This is the
 * inventory: what exists, where it appears, and what to do about it. The Draw
 * panel on the left stays the place to restyle one.
 *
 * Grouped by STARTING scene, which is where a shape was drawn and how you think
 * of it. One that runs on from there still belongs to the group it started in;
 * its span is written on the row.
 */
export function DrawingsPanel({
  doc,
  onDocChange,
  sceneIndex,
  selected,
  onSelect,
  onDuplicate,
}: Props) {
  const i18n = useI18n();
  const { t, tn } = i18n;
  const [thisScene, setThisScene] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [lift, setLift] = useState<Lift | null>(null);
  // Where the lifted row would land, as a position among its own group's rows.
  const [dropAt, setDropAt] = useState<number | null>(null);

  const all = annotationsOf(doc);

  // Document indices throughout, never indices into the filtered view: a reorder
  // made while filtering must move the shape the row actually stands for.
  const entries: Entry[] = all
    .map((ann, docIndex) => ({ ann, docIndex, range: sceneRange(doc, ann) }))
    .filter((e) => !thisScene || (sceneIndex >= e.range[0] && sceneIndex <= e.range[1]));

  const groups = doc.scenes
    .map((scene, index) => ({ scene, index, rows: entries.filter((e) => e.range[0] === index) }))
    .filter((g) => g.rows.length > 0);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const anyOpen = groups.some((g) => !collapsed.has(g.scene.id));

  /**
   * Land the lifted row at position `to` among its group's rows.
   *
   * Reordering stays inside one group, because that is the only span where the
   * result is the one you asked for: a row dropped into another group would snap
   * straight back, since the group is decided by the shape's starting scene and
   * not by where it sits in the list.
   */
  const drop = (group: number, rows: Entry[]) => {
    // Only the group the drag started in may act on it. A drop elsewhere lands
    // on rows the lifted position does not index, and would move the wrong
    // shape — invisibly, because the list regroups afterwards either way.
    if (lift?.group === group && dropAt !== null && dropAt !== lift.pos && dropAt !== lift.pos + 1) {
      // Moving down, land after the row now above the gap; moving up, land
      // before the row below it. Both read straight off the group's own
      // document indices.
      const to = dropAt > lift.pos ? rows[dropAt - 1].docIndex : rows[dropAt].docIndex;
      onDocChange(reorderAnnotation(doc, lift.docIndex, to));
    }
    setLift(null);
    setDropAt(null);
  };

  if (all.length === 0) {
    return (
      <p className="p-4 text-[11px] leading-relaxed text-ink-300">
        {t("drawn.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-1">
        <button
          type="button"
          aria-pressed={thisScene}
          onClick={() => setThisScene(!thisScene)}
          className={cn(
            "min-w-0 flex-1 truncate rounded border px-1.5 py-1 text-[11px] transition",
            thisScene
              ? "border-accent text-accent"
              : "border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-200",
          )}
        >
          {thisScene
            ? t("drawn.onScene", { scene: doc.scenes[sceneIndex]?.name ?? t("drawn.thisScene") })
            : t("drawn.allScenes")}
        </button>
        {groups.length > 1 && (
          <button
            type="button"
            onClick={() => setCollapsed(anyOpen ? new Set(groups.map((g) => g.scene.id)) : new Set())}
            title={t(anyOpen ? "drawn.collapseAll" : "drawn.expandAll")}
            className="shrink-0 rounded border border-ink-600 px-1.5 py-1 text-[11px] text-ink-400 transition hover:border-ink-400 hover:text-ink-200"
          >
            {t(anyOpen ? "drawn.collapse" : "drawn.expand")}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <SceneGroup
          key={group.scene.id}
          doc={doc}
          scene={group.scene}
          rows={group.rows}
          open={!collapsed.has(group.scene.id)}
          onToggle={() => toggle(group.scene.id)}
          current={group.index === sceneIndex}
          sceneIndex={sceneIndex}
          selected={selected}
          lift={lift?.group === group.index ? lift : null}
          dropAt={lift?.group === group.index ? dropAt : null}
          onLift={(pos, docIndex) => setLift({ group: group.index, pos, docIndex })}
          onDragOver={(pos) => {
            // Ignored unless the drag started here, so another group never draws
            // a line for a row that cannot land in it.
            if (lift?.group === group.index) setDropAt(pos);
          }}
          onDrop={() => drop(group.index, group.rows)}
          onDragEnd={() => {
            setLift(null);
            setDropAt(null);
          }}
          onSelect={onSelect}
          onDuplicate={onDuplicate}
          onDocChange={onDocChange}
          i18n={i18n}
        />
      ))}

      {groups.length === 0 && (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {tn("drawn.noneHere", all.length)}
        </p>
      )}
    </div>
  );
}

function SceneGroup({
  doc,
  scene,
  rows,
  open,
  onToggle,
  current,
  sceneIndex,
  selected,
  lift,
  dropAt,
  onLift,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelect,
  onDuplicate,
  onDocChange,
  i18n,
}: {
  doc: BoardDoc;
  scene: Scene;
  rows: Entry[];
  open: boolean;
  onToggle: () => void;
  current: boolean;
  sceneIndex: number;
  selected: string | null;
  lift: Lift | null;
  dropAt: number | null;
  onLift: (pos: number, docIndex: number) => void;
  onDragOver: (pos: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onSelect: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onDocChange: Change<BoardDoc>;
  i18n: I18n;
}) {
  const holdsSelection = rows.some((r) => r.ann.id === selected);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-0.5 py-0.5 text-left transition hover:bg-ink-700/40"
      >
        <ChevronDown
          size={12}
          className={cn("shrink-0 text-ink-400 transition-transform", !open && "-rotate-90")}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide",
            current ? "text-accent" : "text-ink-300",
          )}
        >
          {scene.name}
        </span>
        {/* So a collapsed group still says the selected shape is in there. */}
        {!open && holdsSelection && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
        <span className="shrink-0 font-mono text-[11px] text-ink-500">{rows.length}</span>
      </button>

      {open &&
        rows.map((entry, pos) => (
          <Row
            key={entry.ann.id}
            doc={doc}
            ann={entry.ann}
            range={entry.range}
            here={sceneIndex >= entry.range[0] && sceneIndex <= entry.range[1]}
            selected={selected === entry.ann.id}
            dragging={lift?.pos === pos}
            dropBefore={dropAt === pos}
            dropAfter={dropAt === rows.length && pos === rows.length - 1}
            pos={pos}
            last={rows.length - 1}
            onFocus={() => onSelect(entry.ann.id)}
            onPatch={(fields, merge) =>
              onDocChange(updateAnnotation(doc, entry.ann.id, fields), merge)
            }
            onDelete={() => {
              onDocChange(deleteAnnotation(doc, entry.ann.id));
              if (selected === entry.ann.id) onSelect(null);
            }}
            onDuplicate={() => onDuplicate(entry.ann.id)}
            onReorder={(to) => onDocChange(reorderAnnotation(doc, entry.docIndex, rows[to].docIndex))}
            onDragStart={() => onLift(pos, entry.docIndex)}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            i18n={i18n}
          />
        ))}
    </div>
  );
}

function Row({
  doc,
  ann,
  range,
  here,
  selected,
  dragging,
  dropBefore,
  dropAfter,
  pos,
  last,
  onFocus,
  onPatch,
  onDelete,
  onDuplicate,
  onReorder,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  i18n,
}: {
  doc: BoardDoc;
  ann: Annotation;
  range: [number, number];
  here: boolean;
  selected: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  pos: number;
  last: number;
  onFocus: () => void;
  onPatch: (fields: Partial<Annotation>, merge?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (to: number) => void;
  onDragStart: () => void;
  onDragOver: (pos: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  i18n: I18n;
}) {
  const { t, tn } = i18n;
  const Icon = KIND_ICON[ann.kind];
  const label = describeAnnotation(ann, t);
  // The placeholder shows what the row would be called with no name of its own,
  // so clearing the field reads as reverting rather than as breaking it.
  const fallback = ann.kind === "text" && ann.text.trim() ? ann.text.trim() : t(KIND_KEY[ann.kind]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        // Above the midpoint drops before this row, below it drops after.
        const box = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY < box.top + box.height / 2 ? pos : pos + 1);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "relative rounded-md border transition",
        selected ? "border-accent bg-ink-700" : "border-ink-600",
        // Dimmed rather than hidden: a shape that belongs to another scene is
        // still yours to manage from here.
        (!here || ann.hidden) && "opacity-50",
        dragging && "opacity-40",
      )}
    >
      {/* In the gap between rows, so it marks a position rather than an object. */}
      {dropBefore && <DropLine className="-top-1" />}
      {dropAfter && <DropLine className="-bottom-1" />}

      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", ann.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            const to = e.key === "ArrowUp" ? pos - 1 : e.key === "ArrowDown" ? pos + 1 : null;
            if (to === null || to < 0 || to > last) return;
            e.preventDefault();
            // The editor nudges the selection on arrow keys from a window
            // listener; stopping here keeps restacking from moving players.
            e.stopPropagation();
            onReorder(to);
          }}
          aria-label={t("drawn.reorder", { label })}
          title={t("drawn.reorder.title")}
          className="flex size-4 shrink-0 cursor-grab items-center justify-center rounded text-ink-500 transition hover:text-ink-200 focus:outline-none focus-visible:text-accent active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </button>

        <Icon size={12} className="shrink-0" style={{ color: ann.color }} />

        {/* Rename in place. Focusing is the same act as selecting, so there is
            no separate click to reach the shape on the board. */}
        <input
          value={ann.name ?? ""}
          placeholder={fallback}
          onFocus={onFocus}
          onChange={(e) => onPatch({ name: e.target.value || undefined }, `ann-name:${ann.id}`)}
          aria-label={t("drawn.nameLabel", { label })}
          title={t(here ? "drawn.rename.here" : "drawn.rename.away")}
          className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-ink-200 outline-none transition placeholder:text-ink-300 hover:border-ink-600 focus:border-accent focus:text-white"
        />

        <Tiny
          label={t(ann.hidden ? "drawn.showShape" : "drawn.hideShape")}
          active={!ann.hidden}
          onClick={() => onPatch({ hidden: !ann.hidden })}
        >
          {ann.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </Tiny>
        <Tiny label={t("drawn.duplicate", { label })} onClick={onDuplicate}>
          <Copy size={12} />
        </Tiny>
        <Tiny label={t("drawn.delete", { label })} onClick={onDelete}>
          <Trash2 size={12} />
        </Tiny>
      </div>

      {/* Ids, not indices, so reordering scenes carries the shape along. */}
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <SceneSelect
          title={t("drawn.visibleFrom")}
          doc={doc}
          value={ann.from}
          onChange={(id) => id && onPatch({ from: id })}
        />
        <span className="shrink-0 text-[11px] text-ink-500">→</span>
        <SceneSelect
          title={t("drawn.visibleTo")}
          doc={doc}
          value={ann.to}
          allowEnd
          onChange={(id) => onPatch({ to: id })}
        />
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-500">
          {tn("drawn.span", range[1] - range[0] + 1)}
        </span>
      </div>
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

function SceneSelect({
  title,
  doc,
  value,
  allowEnd,
  onChange,
}: {
  title: string;
  doc: BoardDoc;
  value: string | null;
  allowEnd?: boolean;
  onChange: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <select
      value={value ?? ""}
      aria-label={title}
      title={title}
      onChange={(e) => onChange(e.target.value || null)}
      className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-[11px] text-ink-300 outline-none focus:border-accent"
    >
      {allowEnd && <option value="">{t("drawn.end")}</option>}
      {doc.scenes.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
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
