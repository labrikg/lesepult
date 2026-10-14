import type { NormRect } from "../lib/repo";
import { cleanSelectedText, mergeLineRects, normalize } from "./highlights";
import { fixAccents, runsToText, type TextRun } from "./mathText";
import { runFromSpan } from "./textRuns";

export interface PageSelection {
  pageNumber: number;
  rects: NormRect[];
  text: string;
}

export interface ViewerSelection {
  pages: PageSelection[];
  /** Screen box of the end of the selection, to place the toolbar next to it. */
  anchor: { left: number; top: number; right: number; bottom: number };
}

/**
 * Reads the current text selection inside the viewer and turns it into page-relative boxes,
 * one group per PDF page. Only text in PDF.js text layers counts. Returns null if nothing usable
 * is selected.
 */
export function readSelection(root: HTMLElement): ViewerSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const textNodes: Text[] = [];
  const common = range.commonAncestorContainer;
  if (common.nodeType === Node.TEXT_NODE) {
    textNodes.push(common as Text);
  } else {
    const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n as Text);
  }

  const pages = new Map<number, { el: HTMLElement; rects: NormRect[]; parts: string[]; runs: (TextRun | null)[] }>();
  let anchor: ViewerSelection["anchor"] | null = null;

  for (const node of textNodes) {
    const layer = node.parentElement?.closest(".textLayer");
    const pageEl = layer?.closest<HTMLElement>(".pdf-page");
    if (!layer || !pageEl) continue;
    const pageNumber = Number(pageEl.dataset.page);
    const sub = document.createRange();
    sub.setStart(node, node === range.startContainer ? range.startOffset : 0);
    sub.setEnd(node, node === range.endContainer ? range.endOffset : node.length);
    if (sub.collapsed) continue;

    const box = pageEl.getBoundingClientRect();
    let entry = pages.get(pageNumber);
    if (!entry) {
      entry = { el: pageEl, rects: [], parts: [], runs: [] };
      pages.set(pageNumber, entry);
    }
    for (const r of sub.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      entry.rects.push(
        normalize(
          { left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height },
          box.width,
          box.height,
        ),
      );
      anchor = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    const part = sub.toString();
    entry.parts.push(part);
    entry.runs.push(runFromSpan(node.parentElement, part));
  }

  const result: PageSelection[] = [...pages.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pageNumber, e]) => ({
      pageNumber,
      rects: mergeLineRects(e.rects),
      text: cleanSelectedText(selectedText(e.runs, e.parts, pages.size === 1 ? sel.toString() : null)),
    }))
    .filter((p) => p.rects.length > 0 && p.text.length > 0);

  return result.length && anchor ? { pages: result, anchor } : null;
}

/**
 * The selected text of one page. With font information on every span, formulas come out as
 * inline LaTeX ($i_1 \cdot i_2$) and broken umlauts are repaired; otherwise plain text.
 */
function selectedText(runs: (TextRun | null)[], parts: string[], whole: string | null): string {
  if (runs.length && runs.every((r): r is TextRun => r !== null)) return runsToText(runs);
  return fixAccents(whole ?? parts.join(""));
}
