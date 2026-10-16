import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { uid } from "../lib/db";
import { compactPoints, eraseAlong, SHEET_H, SHEET_W, type Sheet, type Stroke, type Tool } from "./model";
import { drawSheet, drawStroke, outlinePath, strokeOutline, type InkPalette } from "./render";

export interface Brush {
  tool: Tool;
  color: string;
  size: number;
}

interface Props {
  sheet: Sheet;
  index: number;
  /** CSS pixels. */
  width: number;
  dpr: number;
  palette: InkPalette;
  brush: Brush;
  /** Fingers draw too (otherwise they scroll, so a resting hand doesn't leave marks). */
  fingerDraws: boolean;
  /** The scroll container, for scrolling with a finger. */
  scroller: React.RefObject<HTMLDivElement | null>;
  onChange(sheetId: string, before: Stroke[], after: Stroke[]): void;
  canDelete: boolean;
  onDelete(sheetId: string): void;
}

/** Eraser radius in sheet units. */
const ERASER_R = 9;

/** Bit for the eraser end of a pen (Surface Pen, Wacom) in PointerEvent.buttons. */
const ERASER_BUTTONS = 32;

export function SheetView({
  sheet,
  index,
  width,
  dpr,
  palette,
  brush,
  fingerDraws,
  scroller,
  onChange,
  canDelete,
  onDelete,
}: Props) {
  const height = Math.round((width * SHEET_H) / SHEET_W);
  const frame = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(index < 2);
  const [armed, setArmed] = useState(false);

  // Canvases only for sheets near the viewport: a Retina A4 canvas is ~20 MB of pixels.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: scroller.current,
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [scroller]);

  // Strokes being edited (erasing) are shown before they're committed.
  const [preview, setPreview] = useState<Stroke[] | null>(null);
  const strokes = preview ?? sheet.strokes;

  const pxW = Math.round(width * dpr);
  const pxH = Math.round(height * dpr);
  const scale = pxW / SHEET_W;

  useLayoutEffect(() => {
    const c = base.current;
    if (!visible || !c) return;
    const ctx = c.getContext("2d");
    if (ctx) drawSheet(ctx, sheet.paper, strokes, palette, scale);
  }, [visible, sheet.paper, strokes, palette, scale, pxW, pxH]);

  /* ---- Input ---- */

  const active = useRef<{
    pointerId: number;
    mode: "draw" | "erase" | "pan";
    pts: number[];
    startY: number;
    startTop: number;
    before: Stroke[];
    current: Stroke[];
    tool: "pen" | "marker";
  } | null>(null);

  const toSheet = (e: { clientX: number; clientY: number }) => {
    const r = live.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SHEET_W, ((e.clientY - r.top) / r.height) * SHEET_H] as const;
  };

  const clearLive = () => {
    const c = live.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  };

  const drawLive = () => {
    const a = active.current;
    const c = live.current;
    const ctx = c?.getContext("2d");
    if (!a || !c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (a.mode === "draw") {
      const s = { id: "", tool: a.tool, color: brush.color, size: brush.size, pts: a.pts };
      drawStroke(ctx, s, palette, scale, outlinePath(strokeOutline(s, false)));
    } else if (a.mode === "erase" && a.pts.length >= 2) {
      const n = a.pts.length;
      ctx.save();
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(a.pts[n - 2] * scale, a.pts[n - 1] * scale, ERASER_R * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (active.current) return;
    const touch = e.pointerType === "touch";
    if (touch && !fingerDraws) {
      active.current = {
        pointerId: e.pointerId,
        mode: "pan",
        pts: [],
        startY: e.clientY,
        startTop: scroller.current?.scrollTop ?? 0,
        before: [],
        current: [],
        tool: "pen",
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    // Left button, pen tip or the pen's eraser end only.
    const penEraser = e.pointerType === "pen" && (e.buttons & ERASER_BUTTONS) !== 0;
    if (e.button !== 0 && !penEraser) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const erase = brush.tool === "eraser" || penEraser;
    const [x, y] = toSheet(e);
    active.current = {
      pointerId: e.pointerId,
      mode: erase ? "erase" : "draw",
      pts: erase ? [x, y] : [x, y, e.pointerType === "mouse" ? -1 : e.pressure],
      startY: 0,
      startTop: 0,
      before: sheet.strokes,
      current: sheet.strokes,
      tool: brush.tool === "marker" ? "marker" : "pen",
    };
    if (erase) eraseStep(x, y);
    drawLive();
  };

  const eraseStep = (x: number, y: number) => {
    const a = active.current!;
    const left = eraseAlong(a.current, [x, y], ERASER_R);
    if (left.length !== a.current.length) {
      a.current = left;
      setPreview(left);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    if (a.mode === "pan") {
      if (scroller.current) scroller.current.scrollTop = a.startTop - (e.clientY - a.startY);
      return;
    }
    // Coalesced events: all the points the pen reported since the last frame, not just one.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = toSheet(ev);
      if (a.mode === "draw") a.pts.push(x, y, ev.pointerType === "mouse" ? -1 : ev.pressure);
      else {
        a.pts.push(x, y);
        eraseStep(x, y);
      }
    }
    drawLive();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    active.current = null;
    clearLive();
    if (a.mode === "draw" && !cancelled) {
      const pts = compactPoints(a.pts);
      if (pts.length >= 3) {
        const stroke: Stroke = { id: uid(), tool: a.tool, color: brush.color, size: brush.size, pts };
        onChange(sheet.id, a.before, [...a.before, stroke]);
      }
    } else if (a.mode === "erase") {
      setPreview(null);
      if (a.current !== a.before) onChange(sheet.id, a.before, a.current);
    }
  };

  // Undo, redo or a reload replaced the strokes: drop any leftover eraser preview.
  useEffect(() => {
    if (!active.current) setPreview(null);
  }, [sheet.strokes]);

  return (
    <div
      ref={frame}
      className="pad-sheet"
      style={{ width, height }}
      data-sheet={index + 1}
      onContextMenu={(e) => e.preventDefault()}
    >
      {visible && (
        <>
          <canvas ref={base} className="pad-canvas" width={pxW} height={pxH} aria-hidden="true" />
          <canvas
            ref={live}
            className={`pad-canvas pad-input pad-input--${brush.tool}`}
            width={pxW}
            height={pxH}
            role="img"
            aria-label={`Sheet ${index + 1}, ${sheet.strokes.length} strokes`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => finish(e)}
            onPointerCancel={(e) => finish(e, true)}
            onLostPointerCapture={(e) => finish(e)}
          />
        </>
      )}
      <span className="pad-sheet-number" aria-hidden="true">
        {index + 1}
      </span>
      {canDelete && (
        <button
          type="button"
          className={`pad-sheet-delete${armed ? " is-armed" : ""}`}
          aria-label={armed ? `Click again to delete sheet ${index + 1}` : `Delete sheet ${index + 1}`}
          onClick={() => (armed ? onDelete(sheet.id) : setArmed(true))}
          onBlur={() => setArmed(false)}
        >
          <Trash2 size={14} aria-hidden="true" />
          {armed && <span>Delete sheet?</span>}
        </button>
      )}
    </div>
  );
}
