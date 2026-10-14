import { describe, expect, it } from "vitest";
import { cleanSelectedText, hitTest, mergeLineRects, normalize } from "./highlights";

describe("highlight geometry", () => {
  it("normalizes px boxes to page units and clamps to the page", () => {
    expect(normalize({ left: 100, top: 50, width: 200, height: 20 }, 1000, 500)).toEqual({
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.04,
    });
    const clamped = normalize({ left: -10, top: 490, width: 1100, height: 30 }, 1000, 500);
    expect(clamped.x).toBe(0);
    expect(clamped.w).toBe(1);
    expect(clamped.y).toBeCloseTo(0.98);
    expect(clamped.h).toBeCloseTo(0.02);
  });

  it("merges word boxes on one line and keeps lines apart", () => {
    const words = [
      { x: 0.1, y: 0.4, w: 0.08, h: 0.03 },
      { x: 0.185, y: 0.401, w: 0.1, h: 0.029 },
      { x: 0.29, y: 0.399, w: 0.05, h: 0.031 },
      // next line
      { x: 0.1, y: 0.45, w: 0.2, h: 0.03 },
    ];
    const lines = mergeLineRects(words);
    expect(lines).toHaveLength(2);
    expect(lines[0].x).toBeCloseTo(0.1);
    expect(lines[0].x + lines[0].w).toBeCloseTo(0.34);
    expect(lines[1]).toEqual({ x: 0.1, y: 0.45, w: 0.2, h: 0.03 });
  });

  it("does not merge distant boxes on the same line (two columns) and drops empty ones", () => {
    const lines = mergeLineRects([
      { x: 0.05, y: 0.2, w: 0.3, h: 0.03 },
      { x: 0.6, y: 0.2, w: 0.3, h: 0.03 },
      { x: 0.4, y: 0.5, w: 0, h: 0.03 },
    ]);
    expect(lines).toHaveLength(2);
  });

  it("hit-tests points against highlight boxes", () => {
    const rects = [{ x: 0.1, y: 0.4, w: 0.3, h: 0.03 }];
    expect(hitTest(rects, 0.2, 0.41)).toBe(true);
    expect(hitTest(rects, 0.5, 0.41)).toBe(false);
    expect(hitTest(rects, 0.2, 0.5)).toBe(false);
  });

  it("cleans up selected text", () => {
    expect(cleanSelectedText("On a colli-\n sion, probe   a\nsequence ")).toBe(
      "On a collision, probe a sequence",
    );
  });
});
