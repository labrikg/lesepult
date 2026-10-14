import type { PDFPageProxy } from "./pdfjs";
import type { TextRun } from "./mathText";

interface Item {
  str?: string;
  fontName?: string;
  transform?: number[];
  width?: number;
}

/**
 * Stores each text span's font, size and baseline on the span (PDF.js creates one span per text
 * item, in order), so a selection can later tell formulas from words.
 */
export function annotateTextLayer(spans: HTMLElement[], allItems: readonly object[], page: PDFPageProxy) {
  const items = allItems as Item[];
  const fontNames = new Map<string, string>();
  const realName = (id: string) => {
    if (!fontNames.has(id)) {
      let name = "";
      try {
        if (page.commonObjs.has(id)) name = (page.commonObjs.get(id) as { name?: string }).name ?? "";
      } catch {
        // Font not loaded: treated as ordinary text.
      }
      fontNames.set(id, name);
    }
    return fontNames.get(id)!;
  };
  const textItems = items.filter((it) => it.str !== undefined);
  textItems.forEach((it, i) => {
    const span = spans[i];
    const t = it.transform;
    if (!span || !t) return;
    span.dataset.font = realName(it.fontName ?? "");
    span.dataset.size = String(Math.round(Math.hypot(t[2], t[3]) * 100) / 100);
    span.dataset.x = String(Math.round(t[4] * 100) / 100);
    span.dataset.y = String(Math.round(t[5] * 100) / 100);
    span.dataset.w = String(Math.round((it.width ?? 0) * 100) / 100);
  });
}

/** The run for (part of) an annotated span; null for spans from before annotation. */
export function runFromSpan(span: HTMLElement | null | undefined, text: string): TextRun | null {
  const d = span?.dataset;
  if (!d || d.size === undefined) return null;
  return {
    text,
    font: d.font ?? "",
    size: Number(d.size),
    x: Number(d.x),
    y: Number(d.y),
    width: Number(d.w),
  };
}
