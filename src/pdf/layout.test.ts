import { describe, expect, it } from "vitest";
import {
  computeLayout,
  currentPage,
  fitWidthScale,
  PAGE_GAP,
  PAGE_PADDING,
  PDF_TO_CSS,
  positionAt,
  scaleFor,
  scrollTopFor,
  visibleRange,
  zoomIn,
  zoomOut,
} from "./layout";

// Three landscape slides (720 × 540 pt) and one portrait page.
const sizes = [
  { w: 720, h: 540 },
  { w: 720, h: 540 },
  { w: 595, h: 842 },
  { w: 720, h: 540 },
];

describe("PDF layout", () => {
  it("stacks pages with padding and gaps", () => {
    const l = computeLayout(sizes, 1);
    expect(l.tops).toEqual([24, 24 + 540 + 16, 24 + 2 * (540 + 16), 24 + 2 * (540 + 16) + 842 + 16]);
    expect(l.totalHeight).toBe(PAGE_PADDING * 2 + 540 * 3 + 842 + PAGE_GAP * 3);
    expect(computeLayout([], 1).totalHeight).toBe(0);
  });

  it("fits the widest page to the container", () => {
    expect(fitWidthScale(768, sizes)).toBeCloseTo((768 - 48) / 720);
    expect(scaleFor("fit", 768, sizes)).toBeCloseTo(1);
    expect(scaleFor(1, 768, sizes)).toBeCloseTo(PDF_TO_CSS);
  });

  it("finds the current page and the pages worth rendering", () => {
    const l = computeLayout(sizes, 1);
    expect(currentPage(l, 0, 600)).toBe(1);
    expect(currentPage(l, l.tops[2], 600)).toBe(3);
    expect(currentPage(l, 1e9, 600)).toBe(4);
    expect(visibleRange(l, 0, 600, 0)).toEqual([1, 2]);
    expect(visibleRange(l, l.tops[2] + 10, 300, 0)).toEqual([3, 3]);
    expect(visibleRange(computeLayout([], 1), 0, 600)).toEqual([1, 0]);
  });

  it("keeps the reading position across zoom levels", () => {
    const small = computeLayout(sizes, 1);
    const big = computeLayout(sizes, 2);
    const top = small.tops[2] - PAGE_PADDING + small.heights[2] / 2;
    const pos = positionAt(small, top);
    expect(pos.page).toBe(3);
    expect(pos.fraction).toBeCloseTo(0.5);
    const restored = positionAt(big, scrollTopFor(big, pos.page, pos.fraction));
    expect(restored.page).toBe(3);
    expect(restored.fraction).toBeCloseTo(0.5, 2);
  });

  it("steps through zoom levels and stops at the ends", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(1.03)).toBe(1.1);
    expect(zoomIn(3)).toBe(3);
    expect(zoomOut(0.5)).toBe(0.5);
  });
});
