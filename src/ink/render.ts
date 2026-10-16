import { getStroke } from "perfect-freehand";
import { hasPressure, SHEET_H, SHEET_W, type Paper, type Stroke } from "./model";

/** Actual colours for the named ink colours, plus paper and ruling. */
export interface InkPalette {
  paper: string;
  rule: string;
  pen: Record<string, string>;
  marker: Record<string, string>;
  markerAlpha: number;
}

/** Light paper as in print and export, whatever theme is on screen. */
export const PRINT_PALETTE: InkPalette = {
  paper: "#ffffff",
  rule: "#d6cab6",
  pen: { ink: "#2a2420", blue: "#2557a7", red: "#b8392b", green: "#2e7048" },
  marker: { yellow: "#f6d34a", green: "#9fdc8c", blue: "#9cc9f0", pink: "#f5a3c7" },
  markerAlpha: 0.45,
};

/** The palette of the current theme and colour theme, read from the CSS tokens. */
export function screenPalette(): InkPalette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    paper: v("--paper", PRINT_PALETTE.paper),
    rule: v("--line-strong", PRINT_PALETTE.rule),
    pen: {
      ink: v("--ink", PRINT_PALETTE.pen.ink),
      blue: v("--pen-blue", PRINT_PALETTE.pen.blue),
      red: v("--pen-red", PRINT_PALETTE.pen.red),
      green: v("--pen-green", PRINT_PALETTE.pen.green),
    },
    marker: {
      yellow: v("--marker-yellow", PRINT_PALETTE.marker.yellow),
      green: v("--marker-green", PRINT_PALETTE.marker.green),
      blue: v("--marker-blue", PRINT_PALETTE.marker.blue),
      pink: v("--marker-pink", PRINT_PALETTE.marker.pink),
    },
    markerAlpha: dark ? 0.42 : 0.45,
  };
}

/** Points as perfect-freehand wants them: [x, y, pressure]. */
function toInput(pts: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 2 < pts.length; i += 3) out.push([pts[i], pts[i + 1], pts[i + 2] < 0 ? 0.5 : pts[i + 2]]);
  return out;
}

/** The filled outline of a stroke, in sheet units. `last` is false while it's still being drawn. */
export function strokeOutline(s: Pick<Stroke, "tool" | "size" | "pts">, last = true): number[][] {
  const pressure = s.tool === "pen" && hasPressure(s.pts);
  return getStroke(toInput(s.pts), {
    size: s.size,
    last,
    ...(s.tool === "marker"
      ? { thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false, start: { cap: true }, end: { cap: true } }
      : pressure
        ? { thinning: 0.55, smoothing: 0.55, streamline: 0.45, simulatePressure: false }
        : // Without pressure (mouse, Sidecar) a little speed-based thinning still looks like ink.
          { thinning: 0.25, smoothing: 0.55, streamline: 0.45, simulatePressure: true }),
  });
}

/** A smooth closed path through the outline points (quadratic curves through midpoints). */
export function outlinePath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  const [x0, y0] = outline[0];
  path.moveTo(x0, y0);
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
  }
  path.closePath();
  return path;
}

// Finished strokes never change, so their paths are worth keeping.
const pathCache = new WeakMap<Stroke, Path2D>();
function pathOf(s: Stroke): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = outlinePath(strokeOutline(s));
    pathCache.set(s, p);
  }
  return p;
}

/** Ruling in sheet units: lines every 32 (about 6.8 mm on A4), grid and dots every 32 too. */
const STEP = 32;
const TOP = 96;

export function drawPaper(ctx: CanvasRenderingContext2D, paper: Paper, palette: InkPalette, scale: number) {
  ctx.save();
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, SHEET_W * scale, SHEET_H * scale);
  ctx.strokeStyle = palette.rule;
  ctx.fillStyle = palette.rule;
  ctx.lineWidth = Math.max(1, 1.1 * scale);
  if (paper === "lined") {
    ctx.beginPath();
    for (let y = TOP; y < SHEET_H - 40; y += STEP) {
      const py = Math.round(y * scale) + 0.5;
      ctx.moveTo(60 * scale, py);
      ctx.lineTo((SHEET_W - 60) * scale, py);
    }
    ctx.stroke();
  } else if (paper === "grid") {
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let x = STEP; x < SHEET_W; x += STEP) {
      const px = Math.round(x * scale) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, SHEET_H * scale);
    }
    for (let y = STEP; y < SHEET_H; y += STEP) {
      const py = Math.round(y * scale) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(SHEET_W * scale, py);
    }
    ctx.stroke();
  } else if (paper === "dots") {
    const r = Math.max(1, 1.6 * scale);
    for (let x = STEP; x < SHEET_W; x += STEP) {
      for (let y = STEP; y < SHEET_H; y += STEP) {
        ctx.beginPath();
        ctx.arc(x * scale, y * scale, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Paints one stroke; `scale` maps sheet units to canvas pixels. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  palette: InkPalette,
  scale: number,
  path: Path2D = pathOf(s),
) {
  ctx.save();
  ctx.scale(scale, scale);
  if (s.tool === "marker") {
    ctx.globalAlpha = palette.markerAlpha;
    ctx.fillStyle = palette.marker[s.color] ?? palette.marker.yellow;
  } else {
    ctx.fillStyle = palette.pen[s.color] ?? palette.pen.ink;
  }
  ctx.fill(path);
  ctx.restore();
}

/** Paper, then highlighter, then pen on top (so marking over writing doesn't hide it). */
export function drawSheet(
  ctx: CanvasRenderingContext2D,
  paper: Paper,
  strokes: Stroke[],
  palette: InkPalette,
  scale: number,
) {
  drawPaper(ctx, paper, palette, scale);
  for (const s of strokes) if (s.tool === "marker") drawStroke(ctx, s, palette, scale);
  for (const s of strokes) if (s.tool === "pen") drawStroke(ctx, s, palette, scale);
}

/** A sheet as a PNG (for exports and printing), `width` pixels wide. */
export async function sheetPng(paper: Paper, strokes: Stroke[], width = 1600): Promise<Blob> {
  const scale = width / SHEET_W;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(SHEET_H * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the sheet");
  drawSheet(ctx, paper, strokes, PRINT_PALETTE, scale);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the sheet"))), "image/png"),
  );
}
