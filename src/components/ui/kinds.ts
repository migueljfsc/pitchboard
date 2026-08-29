import { ArrowUpRight, Circle, Minus, Pencil, Square, Type } from "lucide-react";
import type { Annotation, AnnotationKind } from "@/board/types";

/** How each shape is named and iconed, shared by the draw tools and the list. */
export const KIND_LABEL: Record<AnnotationKind, string> = {
  arrow: "Arrow",
  line: "Line",
  rect: "Box",
  ellipse: "Oval",
  pen: "Freehand",
  text: "Text",
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
export function describeAnnotation(ann: Annotation): string {
  const named = ann.name?.trim();
  if (named) return named;
  if (ann.kind === "text") {
    const text = ann.text.trim();
    if (text) return text;
  }
  return KIND_LABEL[ann.kind];
}
