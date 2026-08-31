import type { BoardDoc } from "@/board/types";
import { useI18n } from "@/i18n/context";

/**
 * Pick one end of a scene range.
 *
 * Values are scene IDS, never indices, because that is how a range is stored —
 * reordering scenes then carries the thing with it instead of leaving it pinned to
 * a slot that now holds something else.
 *
 * The empty option is the OPEN end: "to the end of the timeline" rather than "no
 * scene". Only the `to` side offers it, which is why `allowEnd` is opt-in.
 *
 * This is the compact, inline variant — a bare select sized to sit in a row. The
 * Draw panel has a labelled sibling of its own for a stacked form; it is not this
 * one wearing different classes, and it has not been merged into this one for the
 * same reason `SizeField` was left alone.
 */
export function SceneSelect({
  title,
  doc,
  value,
  allowEnd,
  onChange,
}: {
  title: string;
  doc: BoardDoc;
  /** Null is the open end where `allowEnd`, and the first scene otherwise. */
  value: string | null | undefined;
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
