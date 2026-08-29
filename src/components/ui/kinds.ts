import { ArrowUpRight, Circle, Minus, Pencil, Square, Type } from "lucide-react";
import type { Annotation, AnnotationKind } from "@/board/types";
import type { MessageKey } from "@/i18n/core";

/**
 * How each shape is named and iconed, shared by the draw tools and the list.
 *
 * A key rather than a word, because this module has no language of its own —
 * the caller has the translator and passes it in.
 */
export const KIND_KEY: Record<AnnotationKind, MessageKey> = {
  arrow: "kind.arrow",
  line: "kind.line",
  rect: "kind.rect",
  ellipse: "kind.ellipse",
  pen: "kind.pen",
  text: "kind.text",
};

export const KIND_ICON: Record<AnnotationKind, typeof Minus> = {
  arrow: ArrowUpRight,
  line: Minus,
  rect: Square,
  ellipse: Circle,
  pen: Pencil,
  text: Type,
};

/**
 * What to call a shape in a list: its own name, else a label's own text, else
 * the kind. Never empty, so a row always says something.
 */
export function describeAnnotation(ann: Annotation, t: (key: MessageKey) => string): string {
  const named = ann.name?.trim();
  if (named) return named;
  if (ann.kind === "text") {
    const text = ann.text.trim();
    if (text) return text;
  }
  return t(KIND_KEY[ann.kind]);
}
