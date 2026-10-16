/*
 * Handwriting model. A sheet is a piece of A4 paper in its own units (1000 wide, 1414 high), so
 * strokes scale with the pane. A stroke keeps its points as a flat list [x, y, pressure, …].
 */

export const SHEET_W = 1000;
export const SHEET_H = 1414;

export type Tool = "pen" | "marker" | "eraser";
export type Paper = "blank" | "lined" | "grid" | "dots";
export const PAPERS: { id: Paper; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "lined", label: "Lined" },
  { id: "grid", label: "Grid" },
  { id: "dots", label: "Dots" },
];

/** Colours are names, not values: each theme (and the export) maps them to its own shade. */
export type PenColor = "ink" | "blue" | "red" | "green";
export type MarkerColor = "yellow" | "green" | "blue" | "pink";
export const PEN_COLORS: { id: PenColor; label: string }[] = [
  { id: "ink", label: "Black" },
  { id: "blue", label: "Blue" },
  { id: "red", label: "Red" },
  { id: "green", label: "Green" },
];
export const MARKER_COLORS: { id: MarkerColor; label: string }[] = [
  { id: "yellow", label: "Yellow" },
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "pink", label: "Pink" },
];

/** Stroke widths in sheet units (a sheet is 1000 wide). */
export const PEN_SIZES = [3, 4.6, 7.5] as const;
export const MARKER_SIZES = [14, 20, 28] as const;

export interface Stroke {
  id: string;
  tool: "pen" | "marker";
  color: string;
  size: number;
  /** Flat [x, y, pressure, x, y, pressure, …]; pressure 0..1, or -1 when the device has none. */
  pts: number[];
}

export interface Sheet {
  id: string;
  pageId: string;
  position: number;
  paper: Paper;
  strokes: Stroke[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Rounds points to what's visible (0.1 units ≈ 0.02 mm), which keeps the JSON small. */
export function compactPoints(pts: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const x = round1(pts[i]);
    const y = round1(pts[i + 1]);
    const p = pts[i + 2] < 0 ? -1 : round2(pts[i + 2]);
    const n = out.length;
    // Drop exact repeats (pen resting in place).
    if (n >= 3 && out[n - 3] === x && out[n - 2] === y) {
      out[n - 1] = Math.max(out[n - 1], p);
      continue;
    }
    out.push(x, y, p);
  }
  return out;
}

const isStroke = (s: unknown): s is Stroke => {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.tool === "pen" || o.tool === "marker") &&
    typeof o.color === "string" &&
    typeof o.size === "number" &&
    Array.isArray(o.pts) &&
    o.pts.length >= 3 &&
    o.pts.every((v) => typeof v === "number" && Number.isFinite(v))
  );
};

/** Reads stored strokes; anything malformed is skipped rather than breaking the sheet. */
export function parseStrokes(json: string): Stroke[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter(isStroke) : [];
  } catch {
    return [];
  }
}

export const isPaper = (v: unknown): v is Paper => PAPERS.some((p) => p.id === v);

/** Whether a stroke has real pen pressure (mice and some tablets report none or a constant). */
export function hasPressure(pts: number[]): boolean {
  if (pts.length < 3 || pts[2] < 0) return false;
  const first = pts[2];
  for (let i = 5; i < pts.length; i += 3) if (pts[i] !== first) return true;
  // One constant value: 0.5 is what a pressed mouse reports, 0 a tablet without pressure.
  return first !== 0.5 && first !== 0;
}

/** Distance from point (px, py) to the segment a–b. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether a circle of radius r at (x, y) touches the stroke's line. */
export function touchesStroke(s: Stroke, x: number, y: number, r: number): boolean {
  const reach = r + s.size / 2;
  const p = s.pts;
  if (p.length < 6) return Math.hypot(p[0] - x, p[1] - y) <= reach;
  for (let i = 0; i + 5 < p.length; i += 3) {
    if (segmentDistance(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= reach) return true;
  }
  return false;
}

/** The strokes left after erasing along a path of points [x, y, x, y, …] with radius r. */
export function eraseAlong(strokes: Stroke[], path: number[], r: number): Stroke[] {
  if (path.length < 2) return strokes;
  return strokes.filter((s) => {
    for (let i = 0; i + 1 < path.length; i += 2) {
      if (touchesStroke(s, path[i], path[i + 1], r)) return false;
    }
    return true;
  });
}
