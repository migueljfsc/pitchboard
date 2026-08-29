import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Eye,
  EyeOff,
  Minus,
  MousePointer2,
  Pencil,
  Pin,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import type { Annotation, AnnotationDash, BoardDoc, Tool } from "@/board/types";
import {
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  deleteAnnotation,
  updateAnnotation,
} from "@/board/annotations";
import { KIND_LABEL } from "@/components/ui/kinds";
import { PALETTE } from "@/components/ui/palette";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";

type Props = {
  doc: BoardDoc;
  onDocChange: Change<BoardDoc>;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  sticky: boolean;
  onStickyChange: (sticky: boolean) => void;
  color: string;
  onColorChange: (color: string) => void;
  dash: AnnotationDash;
  onDashChange: (dash: AnnotationDash) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Bumped to put the cursor in the selected shape's text field. */
  focusText?: number;
};

const TOOLS: { value: Tool; label: string; icon: typeof Minus; hint: string }[] = [
  { value: "select", label: "Select", icon: MousePointer2, hint: "Select and move (Esc)" },
  { value: "arrow", label: "Arrow", icon: ArrowUpRight, hint: "Drag an arrow — a run, pass or shot" },
  { value: "line", label: "Line", icon: Minus, hint: "Drag a line with no head" },
  { value: "rect", label: "Box", icon: Square, hint: "Drag a rectangular zone" },
  { value: "ellipse", label: "Oval", icon: Circle, hint: "Drag an oval zone" },
  { value: "pen", label: "Pen", icon: Pencil, hint: "Draw freehand" },
  { value: "text", label: "Text", icon: Type, hint: "Click to place a label" },
];

const DASHES: { value: AnnotationDash; label: string; hint: string }[] = [
  { value: "solid", label: "Run", hint: "Solid — a run or a plain line" },
  { value: "dashed", label: "Pass", hint: "Dashed — the pass convention" },
  { value: "wavy", label: "Dribble", hint: "Wavy — the dribble convention" },
];


export function DrawPanel({
  doc,
  onDocChange,
  tool,
  onToolChange,
  sticky,
  onStickyChange,
  color,
  onColorChange,
  dash,
  onDashChange,
  selected,
  onSelect,
  focusText,
}: Props) {
  const annotations = doc.annotations ?? [];
  const active = annotations.find((a) => a.id === selected) ?? null;

  const patch = (id: string, fields: Partial<Annotation>, merge?: string) =>
    onDocChange(updateAnnotation(doc, id, fields), merge);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.value}
            type="button"
            title={t.hint}
            aria-label={t.hint}
            aria-pressed={tool === t.value}
            onClick={() => onToolChange(t.value)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] transition",
              tool === t.value
                ? "border-accent bg-ink-700 text-accent"
                : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
        <button
          type="button"
          title="Stay in the tool after drawing, for several shapes in a row"
          aria-label="Keep the tool armed"
          aria-pressed={sticky}
          onClick={() => onStickyChange(!sticky)}
          className={cn(
            "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] transition",
            sticky
              ? "border-accent bg-ink-700 text-accent"
              : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
          )}
        >
          <Pin size={14} />
          Keep
        </button>
      </div>

      {/* Style for the NEXT shape, and for the selected one if there is one. */}
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Draw in ${c}`}
            onClick={() => {
              onColorChange(c);
              if (active) patch(active.id, { color: c });
            }}
            className={cn(
              "size-4 rounded-full ring-1 transition",
              (active?.color ?? color) === c
                ? "ring-2 ring-accent"
                : "ring-white/15 hover:ring-white/40",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      <div className="flex gap-1">
        {DASHES.map((d) => (
          <button
            key={d.value}
            type="button"
            title={d.hint}
            onClick={() => {
              onDashChange(d.value);
              if (active && (active.kind === "arrow" || active.kind === "line")) {
                patch(active.id, { dash: d.value });
              }
            }}
            className={cn(
              "flex-1 rounded border px-1 py-1 text-[11px] transition",
              (active && (active.kind === "arrow" || active.kind === "line")
                ? active.dash
                : dash) === d.value
                ? "border-accent text-accent"
                : "border-ink-600 text-ink-400 hover:text-ink-200",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {active ? (
        <Selected
          doc={doc}
          ann={active}
          onPatch={(fields, merge) => patch(active.id, fields, merge)}
          onDelete={() => {
            onDocChange(deleteAnnotation(doc, active.id));
            onSelect(null);
          }}
          focusText={focusText}
        />
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {tool === "select"
            ? `${annotations.length} drawn. Click one to restyle it, or pick a tool above.`
            : "Drag on the pitch to draw. Esc goes back to select."}
        </p>
      )}
    </div>
  );
}

/** Everything that applies to one shape once it exists. */
function Selected({
  doc,
  ann,
  onPatch,
  onDelete,
  focusText,
}: {
  doc: BoardDoc;
  ann: Annotation;
  onPatch: (fields: Partial<Annotation>, merge?: string) => void;
  onDelete: () => void;
  focusText?: number;
}) {
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusText) return;
    // A frame late, deliberately. Placing text focuses from a pointerdown
    // handler, and the browser's own focus handling for that same event runs
    // afterwards — focusing now would just be undone by it.
    // One task late, deliberately. Placing text focuses from inside a pointerdown
    // handler, and the browser's own focus handling for that same event runs
    // after the listeners — focusing now would simply be undone by it.
    const timer = setTimeout(() => {
      textRef.current?.focus();
      textRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [focusText]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-accent bg-ink-700 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-300">
          {KIND_LABEL[ann.kind]} selected
        </span>
        <button
          type="button"
          aria-label={ann.hidden ? "Show" : "Hide"}
          title={ann.hidden ? "Show this shape" : "Hide this shape"}
          onClick={() => onPatch({ hidden: !ann.hidden })}
          className={cn(
            "flex size-5 items-center justify-center rounded transition",
            ann.hidden ? "text-ink-400 hover:text-ink-200" : "text-accent",
          )}
        >
          {ann.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>

      {ann.kind === "text" && (
        <div className="flex gap-1.5">
          <input
            ref={textRef}
            value={ann.text}
            onChange={(e) => onPatch({ text: e.target.value }, `ann-text:${ann.id}`)}
            placeholder="Label"
            aria-label="Label text"
            className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-1.5 py-1 text-[11px] text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent"
          />
          {/* Keyed so selecting a different label remounts the field with its
              own value, which is what lets it hold a half-typed number. */}
          <SizeField
            key={ann.id}
            value={ann.size ?? 1}
            onChange={(size) => onPatch({ size }, `ann-size:${ann.id}`)}
          />
        </div>
      )}

      {/* Which scenes it appears on. Ids, not indices, so reordering carries it. */}
      <div className="flex items-center gap-1">
        <SceneSelect
          label="From"
          doc={doc}
          value={ann.from}
          onChange={(id) => id && onPatch({ from: id })}
        />
        <SceneSelect
          label="To"
          doc={doc}
          value={ann.to}
          allowEnd
          onChange={(id) => onPatch({ to: id })}
        />
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center justify-center gap-1 rounded border border-ink-600 px-1.5 py-1 text-[11px] text-ink-400 transition hover:border-red-500/60 hover:text-red-400"
      >
        <Trash2 size={11} /> Delete shape
      </button>
    </div>
  );
}

/**
 * Label size, as a percentage of the default.
 *
 * The typed value lives here rather than in the document: clamping every
 * keystroke would turn "150" into 40 the moment the first character landed.
 * Only a value inside the range is committed, and blur puts the field back in
 * step with what was.
 */
function SizeField({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const asText = (n: number) => String(Math.round(n * 100));
  const [text, setText] = useState(() => asText(value));

  return (
    <label className="flex w-[4.5rem] shrink-0 items-center gap-0.5">
      <input
        type="number"
        min={TEXT_SCALE_MIN * 100}
        max={TEXT_SCALE_MAX * 100}
        step={10}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value) / 100;
          if (n >= TEXT_SCALE_MIN && n <= TEXT_SCALE_MAX) onChange(n);
        }}
        onBlur={() => setText(asText(value))}
        aria-label="Label size"
        title="Label size, as a percentage of the default"
        className="w-full min-w-0 rounded border border-ink-600 bg-ink-900 px-1 py-1 font-mono text-[11px] text-ink-200 outline-none transition hover:border-ink-400 focus:border-accent"
      />
      <span className="text-[11px] text-ink-400">%</span>
    </label>
  );
}

function SceneSelect({
  label,
  doc,
  value,
  allowEnd,
  onChange,
}: {
  label: string;
  doc: BoardDoc;
  value: string | null;
  allowEnd?: boolean;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded border border-ink-600 bg-ink-900 px-1 py-1 text-[11px] text-ink-200 outline-none focus:border-accent"
      >
        {allowEnd && <option value="">End</option>}
        {doc.scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
