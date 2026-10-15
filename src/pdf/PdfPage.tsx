import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TextLayer } from "pdfjs-dist";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import type { PDFDocumentProxy } from "./pdfjs";
import type { Highlight, NormRect } from "../lib/repo";
import { fillFor, mergeLineRects } from "./highlights";
import { registerTextLayer } from "./textSelection";
import { annotateTextLayer } from "./textRuns";
import { piecesOf } from "./indexer";
import { findMatches, fold, joinPieces, pieceSegments, toRaw, type Piece } from "./textMatch";

/** Find-in-PDF on this page: what to mark, which match is current, when to scroll to it. */
export interface PageFind {
  terms: string[];
  /** The current match's index on this page, if it's here. */
  active: number | null;
  reveal: number;
}

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** PDF points → CSS px. */
  scale: number;
  /** Device pixels per CSS pixel (2 on Retina); the canvas is drawn at exactly this resolution. */
  dpr: number;
  top: number;
  left: number;
  width: number;
  height: number;
  highlights: Highlight[];
  activeHighlightId: string | null;
  flashHighlightId: string | null;
  linkedIds: Set<string>;
  onOpenLink(highlightId: string): void;
  snipRect: NormRect | null;
  onOpenHighlight(id: string, anchor: { left: number; top: number; right: number; bottom: number }): void;
  find: PageFind | null;
  /** Scroll so this spot (page-relative y, 0..1) is in view; `reveal` says which request it answers. */
  onReveal(y: number, reveal: number): void;
}

/**
 * One page: a canvas for the pixels plus PDF.js's invisible text layer on top, so text can be
 * selected (and, next, highlighted). Rendered only while near the viewport.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  dpr,
  top,
  left,
  width,
  height,
  highlights,
  activeHighlightId,
  flashHighlightId,
  linkedIds,
  onOpenLink,
  snipRect,
  onOpenHighlight,
  find,
  onReveal,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  /** The text layer's spans and the text items they show, once rendered. */
  const layer = useRef<{ pieces: Piece[]; spans: HTMLElement[] } | null>(null);
  const [layerVersion, setLayerVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
    let textLayer: TextLayer | null = null;
    let unregister: (() => void) | null = null;
    setRendered(false);
    layer.current = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (!canvas || !textDiv) return;

      // One canvas pixel per screen pixel: the canvas gets exactly the page box's size in device
      // pixels and the page is drawn to fill it, so the browser never has to resample (blur) it.
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0],
      });
      await renderTask.promise;
      if (cancelled) return;
      setRendered(true);

      textDiv.replaceChildren();
      const content = await page.getTextContent();
      if (cancelled) return;
      textLayer = new TextLayer({ textContentSource: content, container: textDiv, viewport });
      await textLayer.render();
      if (cancelled) return;
      annotateTextLayer(textLayer.textDivs, content.items, page);
      unregister = registerTextLayer(textDiv);
      layer.current = { pieces: piecesOf(content.items), spans: textLayer.textDivs };
      setLayerVersion((v) => v + 1);
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") console.warn(`page ${pageNumber}`, e);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      unregister?.();
    };
  }, [pdf, pageNumber, scale, dpr, width, height]);

  /* ---- Find: mark the matches on the text layer ---- */
  const [matches, setMatches] = useState<NormRect[][]>([]);
  const terms = find?.terms;
  useLayoutEffect(() => {
    const l = layer.current;
    const pageEl = pageRef.current;
    if (!l || !pageEl || !terms?.length) {
      setMatches([]);
      return;
    }
    const { raw, starts } = joinPieces(l.pieces);
    const f = fold(raw);
    const box = pageEl.getBoundingClientRect();
    const range = document.createRange();
    const found = findMatches(f.text, terms).map((m) => {
      const rects: NormRect[] = [];
      for (const seg of pieceSegments(starts, l.pieces, toRaw(f, raw, m))) {
        const node = l.spans[seg.piece]?.firstChild;
        if (!node?.textContent) continue;
        range.setStart(node, Math.min(seg.start, node.textContent.length));
        range.setEnd(node, Math.min(seg.end, node.textContent.length));
        for (const r of range.getClientRects()) {
          if (r.width < 0.5 || r.height < 0.5) continue;
          rects.push({
            x: (r.left - box.left) / box.width,
            y: (r.top - box.top) / box.height,
            w: r.width / box.width,
            h: r.height / box.height,
          });
        }
      }
      return mergeLineRects(rects);
    });
    setMatches(found.filter((rects) => rects.length));
  }, [layerVersion, terms, width, height]);

  // The current match: clamp (the page may show a match fewer than its stored text) and reveal it.
  const active = find?.active != null && matches.length ? Math.min(find.active, matches.length - 1) : null;
  const revealed = useRef(0);
  const reveal = find?.reveal ?? 0;
  useEffect(() => {
    if (active === null || revealed.current === reveal) return;
    const r = matches[active]?.[0];
    if (!r) return;
    revealed.current = reveal;
    onReveal(r.y + r.h / 2, reveal);
  }, [active, reveal, matches, onReveal]);

  return (
    <div
      ref={pageRef}
      className="pdf-page"
      data-page={pageNumber}
      style={
        {
          top,
          left,
          width,
          height,
          "--total-scale-factor": scale,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} className="pdf-canvas" style={{ width, height, opacity: rendered ? 1 : 0 }} />
      <div className="hl-layer" aria-hidden="true">
        {highlights.flatMap((h) =>
          h.rects.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className={`hl-rect${h.id === activeHighlightId ? " is-active" : ""}${
                h.id === flashHighlightId ? " is-flash" : ""
              }`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: fillFor(h.color),
              }}
            />
          )),
        )}
      </div>
      {matches.length > 0 && (
        <div className="find-layer" aria-hidden="true">
          {matches.flatMap((rects, i) =>
            rects.map((r, j) => (
              <div
                key={`${i}-${j}`}
                className={`find-rect${i === active ? " is-current" : ""}`}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              />
            )),
          )}
        </div>
      )}
      <div ref={textRef} className="textLayer" />
      <div className="hl-badges">
        {highlights
          .filter((h) => h.rects.length && (h.comment || linkedIds.has(h.id)))
          .map((h) => {
            const last = h.rects[h.rects.length - 1];
            return (
              <span
                key={h.id}
                className="hl-markers"
                style={{ left: `${(last.x + last.w) * 100}%`, top: `${last.y * 100}%` }}
              >
                {h.comment && (
                  <button
                    type="button"
                    className="hl-badge"
                    aria-label={`Comment: ${h.comment}`}
                    title={h.comment}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      onOpenHighlight(h.id, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
                    }}
                  >
                    <MessageSquare size={11} aria-hidden="true" />
                  </button>
                )}
                {linkedIds.has(h.id) && (
                  <button
                    type="button"
                    className="hl-innote"
                    title="Show it in the note"
                    onClick={() => onOpenLink(h.id)}
                  >
                    In note
                    <ArrowUpRight size={10} aria-hidden="true" />
                  </button>
                )}
              </span>
            );
          })}
      </div>
      {snipRect && (
        <div
          className="snip-box"
          style={{
            left: `${snipRect.x * 100}%`,
            top: `${snipRect.y * 100}%`,
            width: `${snipRect.w * 100}%`,
            height: `${snipRect.h * 100}%`,
          }}
        />
      )}
    </div>
  );
}
