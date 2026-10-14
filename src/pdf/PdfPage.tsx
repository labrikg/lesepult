import { useEffect, useRef, useState } from "react";
import { TextLayer } from "pdfjs-dist";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import type { PDFDocumentProxy } from "./pdfjs";
import type { Highlight, NormRect } from "../lib/repo";
import { fillFor } from "./highlights";
import { registerTextLayer } from "./textSelection";
import { annotateTextLayer } from "./textRuns";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** PDF points → CSS px. */
  scale: number;
  top: number;
  width: number;
  height: number;
  highlights: Highlight[];
  activeHighlightId: string | null;
  flashHighlightId: string | null;
  linkedIds: Set<string>;
  onOpenLink(highlightId: string): void;
  snipRect: NormRect | null;
  onOpenHighlight(id: string, anchor: { left: number; top: number; right: number; bottom: number }): void;
}

/**
 * One page: a canvas for the pixels plus PDF.js's invisible text layer on top, so text can be
 * selected (and, next, highlighted). Rendered only while near the viewport.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  top,
  width,
  height,
  highlights,
  activeHighlightId,
  flashHighlightId,
  linkedIds,
  onOpenLink,
  snipRect,
  onOpenHighlight,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
    let textLayer: TextLayer | null = null;
    let unregister: (() => void) | null = null;
    setRendered(false);

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (!canvas || !textDiv) return;

      // Render at device resolution so slides stay crisp on Retina screens.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
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
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") console.warn(`page ${pageNumber}`, e);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      unregister?.();
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div
      className="pdf-page"
      data-page={pageNumber}
      style={
        {
          top,
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
