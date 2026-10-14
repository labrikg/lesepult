/**
 * Pure layout maths for the continuous-scroll PDF viewer: where each page sits,
 * which page is "current", which pages need rendering, and zoom levels.
 */

export interface Size {
  w: number;
  h: number;
}

/** PDF units are points (1/72 in); CSS pixels are 1/96 in. "100%" means real size. */
export const PDF_TO_CSS = 96 / 72;

export const PAGE_GAP = 16;
export const PAGE_PADDING = 24;

export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export type Zoom = "fit" | number;

export interface Layout {
  /** Top edge of each page, in px from the top of the scroll content. */
  tops: number[];
  heights: number[];
  widths: number[];
  totalHeight: number;
}

export function computeLayout(sizes: Size[], scale: number, gap = PAGE_GAP, padding = PAGE_PADDING): Layout {
  const tops: number[] = [];
  const heights: number[] = [];
  const widths: number[] = [];
  let y = padding;
  for (const s of sizes) {
    tops.push(y);
    const h = Math.round(s.h * scale);
    heights.push(h);
    widths.push(Math.round(s.w * scale));
    y += h + gap;
  }
  return { tops, heights, widths, totalHeight: sizes.length ? y - gap + padding : 0 };
}

/** Scale at which the widest page fills the available width. */
export function fitWidthScale(containerWidth: number, sizes: Size[], padding = PAGE_PADDING): number {
  const widest = Math.max(1, ...sizes.map((s) => s.w));
  const available = Math.max(120, containerWidth - padding * 2);
  return available / widest;
}

/** Turns a zoom setting into a render scale (PDF points → CSS px). */
export function scaleFor(zoom: Zoom, containerWidth: number, sizes: Size[]): number {
  return zoom === "fit" ? fitWidthScale(containerWidth, sizes) : zoom * PDF_TO_CSS;
}

/** The page shown at the top third of the viewport, 1-based. */
export function currentPage(layout: Layout, scrollTop: number, viewportHeight: number): number {
  const probe = scrollTop + viewportHeight / 3;
  let lo = 0;
  let hi = layout.tops.length - 1;
  if (hi < 0) return 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (layout.tops[mid] <= probe) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** 1-based inclusive range of pages overlapping the viewport plus a buffer above and below. */
export function visibleRange(
  layout: Layout,
  scrollTop: number,
  viewportHeight: number,
  buffer = viewportHeight,
): [number, number] {
  const n = layout.tops.length;
  if (n === 0) return [1, 0];
  const from = scrollTop - buffer;
  const to = scrollTop + viewportHeight + buffer;
  let first = n;
  let last = 1;
  for (let i = 0; i < n; i++) {
    const top = layout.tops[i];
    const bottom = top + layout.heights[i];
    if (bottom >= from && top <= to) {
      first = Math.min(first, i + 1);
      last = Math.max(last, i + 1);
    }
  }
  return first <= last ? [first, last] : [1, 0];
}

/** Where a reading position (page + fraction down that page) lands in a layout. */
export function scrollTopFor(layout: Layout, page: number, fraction = 0): number {
  const i = Math.min(Math.max(page, 1), layout.tops.length) - 1;
  if (i < 0) return 0;
  return Math.max(0, Math.round(layout.tops[i] + fraction * layout.heights[i]) - PAGE_PADDING);
}

/** The reading position at a scroll offset, so it can be restored after zooming. */
export function positionAt(layout: Layout, scrollTop: number): { page: number; fraction: number } {
  const y = scrollTop + PAGE_PADDING;
  const page = currentPage(layout, y, 0);
  const i = page - 1;
  if (i < 0 || !layout.heights[i]) return { page: 1, fraction: 0 };
  return { page, fraction: Math.min(1, Math.max(0, (y - layout.tops[i]) / layout.heights[i])) };
}

export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

export function zoomOut(current: number): number {
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0];
}
