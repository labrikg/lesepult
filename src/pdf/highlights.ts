import type { HighlightColor, NormRect } from "../lib/repo";

export const HIGHLIGHT_COLORS: { id: HighlightColor; label: string; fill: string }[] = [
  { id: "yellow", label: "Yellow", fill: "#f3d27a" },
  { id: "blue", label: "Blue", fill: "#bfd6e8" },
  { id: "green", label: "Green", fill: "#c9ddb8" },
];

export const fillFor = (c: HighlightColor) => HIGHLIGHT_COLORS.find((x) => x.id === c)?.fill ?? "#f3d27a";

/** A box in px relative to the page's top-left corner. */
export interface PxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** px box on a page → page-relative units, clamped to the page. */
export function normalize(r: PxRect, pageWidth: number, pageHeight: number): NormRect {
  const x0 = Math.max(0, Math.min(1, r.left / pageWidth));
  const y0 = Math.max(0, Math.min(1, r.top / pageHeight));
  const x1 = Math.max(0, Math.min(1, (r.left + r.width) / pageWidth));
  const y1 = Math.max(0, Math.min(1, (r.top + r.height) / pageHeight));
  return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
}

/**
 * Text selections arrive as one box per text fragment (often per word). Merge boxes that sit
 * on the same line and touch or nearly touch into one box per line, so highlights look like a
 * single marker stroke and store compactly.
 */
export function mergeLineRects(rects: NormRect[], gap = 0.012): NormRect[] {
  const boxes = rects.filter((r) => r.w > 0.0005 && r.h > 0.0005);

  // 1. Group boxes into text lines by vertical overlap.
  const lines: { top: number; bottom: number; boxes: NormRect[] }[] = [];
  for (const r of [...boxes].sort((a, b) => a.y - b.y)) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, r.y + r.h) - Math.max(l.top, r.y);
      return overlap > 0.5 * Math.min(l.bottom - l.top, r.h);
    });
    if (line) {
      line.boxes.push(r);
      line.top = Math.min(line.top, r.y);
      line.bottom = Math.max(line.bottom, r.y + r.h);
    } else {
      lines.push({ top: r.y, bottom: r.y + r.h, boxes: [r] });
    }
  }

  // 2. Within each line, merge boxes that touch or nearly touch (but keep columns apart).
  const out: NormRect[] = [];
  for (const line of lines.sort((a, b) => a.top - b.top)) {
    let run: NormRect | null = null;
    for (const r of line.boxes.sort((a, b) => a.x - b.x)) {
      if (run && r.x <= run.x + run.w + gap) {
        const x1 = Math.max(run.x + run.w, r.x + r.w);
        const y0 = Math.min(run.y, r.y);
        const y1 = Math.max(run.y + run.h, r.y + r.h);
        run = { x: run.x, y: y0, w: x1 - run.x, h: y1 - y0 };
      } else {
        if (run) out.push(run);
        run = { ...r };
      }
    }
    if (run) out.push(run);
  }
  return out.map((r) => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
}

/** Whether a page-relative point falls on any of the boxes (with a little slack). */
export function hitTest(rects: NormRect[], x: number, y: number, slack = 0.002): boolean {
  return rects.some(
    (r) => x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack,
  );
}

/** Tidies selected text: joins hyphenated line breaks and collapses whitespace. */
export function cleanSelectedText(text: string): string {
  return text
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}
