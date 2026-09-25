import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Ban,
  Circle,
  CircleDot,
  Hand,
  Copy,
  Eye,
  EyeOff,
  Minus,
  MousePointer2,
  Pencil,
  Pentagon,
  Pin,
  Sparkles,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import type { Annotation, AnnotationDash, BoardDoc, TextAlign, Tool } from "@/board/types";
import { isDrawTool } from "@/board/types";
import {
  POLYGON_SIDES_MAX,
  POLYGON_SIDES_MIN,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  textBgAlpha,
  toPolygon,
  updateAnnotation,
} from "@/board/annotations";
import { isHighlighted, setHighlight } from "@/board/scenes";
import { KIND_KEY } from "@/components/ui/kinds";
import { NumberField } from "@/components/ui/NumberField";
import { Stepper } from "@/components/ui/Stepper";
import { PALETTE } from "@/components/ui/palette";
import type { Change } from "@/lib/history";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n/core";

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
  /** Whether the next box or oval is filled. */
  filled: boolean;
  onFilledChange: (filled: boolean) => void;
  /** Corners the next polygon starts with. */
  sides: number;
  onSidesChange: (sides: number) => void;
  selected: string | null;
  /** Copies the shape and selects the copy. Owned by the editor, so the Drawings
   *  list on the other side duplicates through exactly the same call. */
  onDuplicate: (id: string) => void;
  /** Deletes the shape, through the same call as the list and the Delete key. */
  onDelete: (id: string) => void;
  /** Bumped to put the cursor in the selected shape's text field. */
  focusText?: number;
  /** The scene a highlight is set on — highlights are per scene and never carried (D41). */
  sceneIndex: number;
};

const TOOLS: { value: Tool; icon: typeof Minus; key: string }[] = [
  { value: "pan", icon: Hand, key: "pan" },
  { value: "select", icon: MousePointer2, key: "select" },
  { value: "arrow", icon: ArrowUpRight, key: "arrow" },
  { value: "line", icon: Minus, key: "line" },
  { value: "rect", icon: Square, key: "rect" },
  { value: "ellipse", icon: Circle, key: "ellipse" },
  { value: "polygon", icon: Pentagon, key: "polygon" },
  { value: "pen", icon: Pencil, key: "pen" },
  { value: "text", icon: Type, key: "text" },
  { value: "ball", icon: CircleDot, key: "ball" },
];

const DASHES: { value: AnnotationDash; key: string }[] = [
  { value: "solid", key: "solid" },
  { value: "dashed", key: "dashed" },
  { value: "wavy", key: "wavy" },
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
  filled,
  onFilledChange,
  sides,
  onSidesChange,
  selected,
  onDuplicate,
  onDelete,
  focusText,
  sceneIndex,
}: Props) {
  const { t } = useI18n();
  const annotations = doc.annotations ?? [];
  const active = annotations.find((a) => a.id === selected) ?? null;

  const patch = (id: string, fields: Partial<Annotation>, merge?: string) =>
    onDocChange(updateAnnotation(doc, id, fields), merge);

  // The style row follows what is being worked on: the selected shape if there is
  // one, the armed tool otherwise. A zone has a fill and no line style; everything
  // else the other way round.
  const isZone = (kind: string) => kind === "rect" || kind === "ellipse" || kind === "polygon";
  const zone = active !== null ? isZone(active.kind) : isZone(tool);
  const activeFilled =
    active && (active.kind === "rect" || active.kind === "ellipse" || active.kind === "polygon")
      ? active.filled !== false
      : filled;

  return (
    <div className="flex flex-col gap-3">
      {/* Three across, which the nine buttons fill exactly. At five a 10px label had
          about 37px and at four about 43, and "Selecionar" and "Retângulo" need 51.
          A label that still does not fit is cut short rather than spilling; the
          button's hint has the full name. */}
      <div className="grid grid-cols-3 gap-1">
        {TOOLS.map((item) => (
          <button
            key={item.value}
            type="button"
            title={t(`draw.tool.${item.key}.hint` as MessageKey)}
            aria-label={t(`draw.tool.${item.key}.hint` as MessageKey)}
            aria-pressed={tool === item.value}
            onClick={() => onToolChange(item.value)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] transition",
              tool === item.value
                ? "border-accent bg-ink-700 text-accent"
                : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
            )}
          >
            <item.icon size={14} />
            <span className="w-full truncate text-center">
              {t(`draw.tool.${item.key}` as MessageKey)}
            </span>
          </button>
        ))}
        <button
          type="button"
          title={t("draw.keep.title")}
          aria-label={t("draw.keep.aria")}
          aria-pressed={sticky}
          onClick={() => onStickyChange(!sticky)}
          className={cn(
            "flex min-w-0 flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] transition",
            sticky
              ? "border-accent bg-ink-700 text-accent"
              : "border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white",
          )}
        >
          <Pin size={14} />
          <span className="w-full truncate text-center">{t("draw.keep")}</span>
        </button>
      </div>

      {/* Style for the NEXT shape, and for the selected one if there is one. */}
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t("draw.colorAria", { color: c })}
            onClick={() => {
              onColorChange(c);
              // A drawn ball is always drawn as a ball, so a colour would change nothing.
              if (active && active.kind !== "ball") patch(active.id, { color: c });
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

      {zone ? (
        <div className="flex gap-1">
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={activeFilled === value}
              title={t(value ? "draw.fill.filled.hint" : "draw.fill.outline.hint")}
              onClick={() => {
                onFilledChange(value);
                if (
                  active &&
                  (active.kind === "rect" || active.kind === "ellipse" || active.kind === "polygon")
                ) {
                  // Undefined rather than true, so a filled zone serialises as it always did.
                  patch(active.id, { filled: value ? undefined : false });
                }
              }}
              className={cn(
                "flex-1 rounded border px-1 py-1 text-[11px] transition",
                activeFilled === value
                  ? "border-accent text-accent"
                  : "border-ink-600 text-ink-400 hover:text-ink-200",
              )}
            >
              {t(value ? "draw.fill.filled" : "draw.fill.outline")}
            </button>
          ))}
        </div>
      ) : (
      <div className="flex gap-1">
        {DASHES.map((d) => (
          <button
            key={d.value}
            type="button"
            title={t(`draw.dash.${d.key}.hint` as MessageKey)}
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
            {t(`draw.dash.${d.key}` as MessageKey)}
          </button>
        ))}
      </div>
      )}

      {/* The count a drag starts from. Once drawn, corners are added and taken out
          on the shape itself, so a selected polygon has no count to set. */}
      {tool === "polygon" && active?.kind !== "polygon" && (
        <NumberField
          label={t("draw.sides")}
          title={t("draw.sides.title")}
          value={sides}
          min={POLYGON_SIDES_MIN}
          max={POLYGON_SIDES_MAX}
          step={1}
          unit=""
          onCommit={(n) => onSidesChange(Math.round(n))}
        />
      )}

      {active ? (
        <Selected
          doc={doc}
          ann={active}
          onPatch={(fields, merge) => patch(active.id, fields, merge)}
          onToPolygon={() => onDocChange(toPolygon(doc, active.id))}
          onDelete={() => onDelete(active.id)}
          onDuplicate={() => onDuplicate(active.id)}
          focusText={focusText}
          lit={isHighlighted(doc.scenes[sceneIndex], active.id)}
          onToggleLit={() =>
            onDocChange(
              setHighlight(
                doc,
                sceneIndex,
                [active.id],
                isHighlighted(doc.scenes[sceneIndex], active.id) ? null : active.color,
              ),
            )
          }
        />
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-300">
          {!isDrawTool(tool)
            ? t("draw.hint.select", { n: annotations.length })
            : t("draw.hint.drawing")}
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
  onToPolygon,
  onDelete,
  onDuplicate,
  focusText,
  lit,
  onToggleLit,
}: {
  doc: BoardDoc;
  ann: Annotation;
  onPatch: (fields: Partial<Annotation>, merge?: string) => void;
  onToPolygon: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  focusText?: number;
  lit: boolean;
  onToggleLit: () => void;
}) {
  const { t } = useI18n();
  const textRef = useRef<HTMLTextAreaElement>(null);

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
          {t("draw.selected", { kind: t(KIND_KEY[ann.kind]) })}
        </span>
        <div className="flex items-center gap-0.5">
          {/* Lit on this scene only, glowing in its own colour and out of the dark. */}
          <button
            type="button"
            aria-label={t(lit ? "draw.unhighlight" : "draw.highlight")}
            title={t(lit ? "draw.unhighlight" : "draw.highlight")}
            aria-pressed={lit}
            onClick={onToggleLit}
            className={cn(
              "flex size-5 items-center justify-center rounded transition",
              lit ? "text-accent" : "text-ink-400 hover:text-white",
            )}
          >
            <Sparkles size={12} />
          </button>
          <button
            type="button"
            aria-label={t("draw.duplicate")}
            title={t("draw.duplicate")}
            onClick={onDuplicate}
            className="flex size-5 items-center justify-center rounded text-ink-400 transition hover:text-white"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            aria-label={t(ann.hidden ? "draw.show" : "draw.hide")}
            title={t(ann.hidden ? "draw.showThis" : "draw.hideThis")}
            onClick={() => onPatch({ hidden: !ann.hidden })}
            className={cn(
              "flex size-5 items-center justify-center rounded transition",
              ann.hidden ? "text-ink-400 hover:text-ink-200" : "text-accent",
            )}
          >
            {ann.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      </div>

      {ann.kind === "text" && (
        <div className="flex items-start gap-1.5">
          {/* A textarea, not an input: Enter has to be a line break. Wrapping needs a box
              width, which is dragged on the board itself — the handle on the label's right
              edge — because a number in a panel is a worse way to size something you are
              looking at. The editor's shortcut handler already ignores TEXTAREA. */}
          <textarea
            ref={textRef}
            rows={2}
            value={ann.text}
            onChange={(e) => onPatch({ text: e.target.value }, `ann-text:${ann.id}`)}
            placeholder={t("draw.label.placeholder")}
            aria-label={t("draw.label.aria")}
            className="min-w-0 flex-1 resize-y rounded border border-ink-600 bg-ink-900 px-1.5 py-1 text-[11px] leading-snug text-ink-200 outline-none transition placeholder:text-ink-400 hover:border-ink-400 focus:border-accent"
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

      {ann.kind === "text" && <TextAlignRow ann={ann} onPatch={onPatch} />}

      {ann.kind === "text" && <TextBackground ann={ann} onPatch={onPatch} />}

      {ann.kind === "rect" && (
        <button
          type="button"
          title={t("draw.toPolygon.title")}
          onClick={onToPolygon}
          className="flex items-center justify-center gap-1 rounded border border-ink-600 px-1.5 py-1 text-[11px] text-ink-300 transition hover:border-accent hover:text-white"
        >
          <Pentagon size={11} /> {t("draw.toPolygon")}
        </button>
      )}

      {(ann.kind === "polygon" || ann.kind === "arrow" || ann.kind === "line") && (
        <p className="text-[11px] leading-snug text-ink-400">{t("draw.corners.hint")}</p>
      )}

      {/* Which scenes it appears on. Ids, not indices, so reordering carries it. */}
      <div className="flex items-center gap-1">
        <SceneSelect
          label={t("draw.from")}
          doc={doc}
          value={ann.from}
          onChange={(id) => id && onPatch({ from: id })}
        />
        <SceneSelect
          label={t("draw.to")}
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
        <Trash2 size={11} /> {t("draw.delete")}
      </button>
    </div>
  );
}

const ALIGNS: { value: TextAlign | undefined; key: MessageKey; Icon: typeof AlignLeft }[] = [
  { value: "left", key: "draw.align.left", Icon: AlignLeft },
  { value: undefined, key: "draw.align.center", Icon: AlignCenter },
  { value: "right", key: "draw.align.right", Icon: AlignRight },
];

/** Where a label's lines sit inside its box. Centred is stored as absence. */
function TextAlignRow({
  ann,
  onPatch,
}: {
  ann: Extract<Annotation, { kind: "text" }>;
  onPatch: (fields: Partial<Annotation>, merge?: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("draw.align")}>
      {ALIGNS.map(({ value, key, Icon }) => (
        <button
          key={key}
          type="button"
          title={t(key)}
          aria-label={t(key)}
          aria-pressed={ann.align === value}
          onClick={() => onPatch({ align: value })}
          className={cn(
            "flex size-6 items-center justify-center rounded border transition",
            ann.align === value
              ? "border-accent text-white"
              : "border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-200",
          )}
        >
          <Icon size={12} />
        </button>
      ))}
    </div>
  );
}

/**
 * The panel behind a label: whether there is one, and how solid it is.
 *
 * No colour is the fourth state of the swatch row rather than a checkbox, because it
 * is what every label already is — a picker with nothing selected would be lying.
 * Clearing it drops `bgOpacity` too: an opacity with nothing to be opaque is a value
 * that outlives its meaning, and the next colour picked should start from the default
 * rather than from whatever the last one happened to be dragged to.
 */
function TextBackground({
  ann,
  onPatch,
}: {
  ann: Extract<Annotation, { kind: "text" }>;
  onPatch: (fields: Partial<Annotation>, merge?: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{t("draw.bg")}</span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          title={t("draw.bg.none")}
          aria-label={t("draw.bg.noneAria")}
          aria-pressed={ann.bg === undefined}
          onClick={() => onPatch({ bg: undefined, bgOpacity: undefined })}
          className={cn(
            "flex size-4 items-center justify-center rounded-full text-ink-400 ring-1 transition",
            ann.bg === undefined
              ? "ring-2 ring-accent"
              : "ring-white/15 hover:text-ink-200 hover:ring-white/40",
          )}
        >
          <Ban size={10} />
        </button>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t("draw.bg.aria", { color: c })}
            aria-pressed={ann.bg === c}
            onClick={() => onPatch({ bg: c })}
            className={cn(
              "size-4 rounded-full ring-1 transition",
              ann.bg === c ? "ring-2 ring-accent" : "ring-white/15 hover:ring-white/40",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      {/* Nothing to be opaque without a colour, so the control is absent rather than
          present and inert. Keyed so selecting another label remounts the field with
          its own value — it holds a half-typed number, like every other one. */}
      {ann.bg !== undefined && (
        <NumberField
          key={ann.id}
          label={t("draw.bg.opacity")}
          title={t("draw.bg.opacity.title")}
          value={Math.round(textBgAlpha(ann) * 100)}
          min={0}
          max={100}
          step={5}
          unit="%"
          onCommit={(percent) => onPatch({ bgOpacity: percent / 100 }, `ann-bgo:${ann.id}`)}
        />
      )}
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
  const { t } = useI18n();
  const asText = (n: number) => String(Math.round(n * 100));
  const [text, setText] = useState(() => asText(value));
  /** Ten points of the percentage, from what is committed, kept inside the range. */
  const step = (direction: 1 | -1) => {
    const n = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, (Math.round(value * 10) + direction) / 10));
    setText(asText(n));
    if (n !== value) onChange(n);
  };

  return (
    <label className="flex w-[5.25rem] shrink-0 items-center gap-0.5">
      <span className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded border border-ink-600 bg-ink-900 transition hover:border-ink-400 focus-within:border-accent">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value) / 100;
            if (n >= TEXT_SCALE_MIN && n <= TEXT_SCALE_MAX) onChange(n);
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          }}
          onBlur={() => setText(asText(value))}
          aria-label={t("draw.size.aria")}
          title={t("draw.size.title")}
          className="w-full min-w-0 bg-ink-900 px-1 py-1 font-mono text-[11px] text-ink-200 outline-none"
        />
        <Stepper
          className="border-l border-ink-600"
          upLabel={t("field.increase", { label: t("draw.size.aria") })}
          downLabel={t("field.decrease", { label: t("draw.size.aria") })}
          upDisabled={value >= TEXT_SCALE_MAX}
          downDisabled={value <= TEXT_SCALE_MIN}
          onUp={() => step(1)}
          onDown={() => step(-1)}
        />
      </span>
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
  const { t } = useI18n();
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded border border-ink-600 bg-ink-900 px-1 py-1 text-[11px] text-ink-200 outline-none focus:border-accent"
      >
        {allowEnd && <option value="">{t("drawn.end")}</option>}
        {doc.scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
