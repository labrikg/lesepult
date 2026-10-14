import { useEffect, useRef, useState } from "react";
import { TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy } from "./pdfjs";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** PDF points → CSS px. */
  scale: number;
  top: number;
  width: number;
  height: number;
}

/**
 * One page: a canvas for the pixels plus PDF.js's invisible text layer on top, so text can be
 * selected (and, next, highlighted). Rendered only while near the viewport.
 */
export function PdfPage({ pdf, pageNumber, scale, top, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
    let textLayer: TextLayer | null = null;
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
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      });
      await textLayer.render();
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") console.warn(`page ${pageNumber}`, e);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
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
      <div ref={textRef} className="textLayer" />
    </div>
  );
}
