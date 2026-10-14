import { invoke } from "@tauri-apps/api/core";
import type { Document, Highlight, NormRect, Snip } from "../lib/repo";
import type { PDFDocumentProxy } from "./pdfjs";
import { PDF_TO_CSS } from "./layout";

/** The note block for a quoted highlight (see editor/PdfBlocks.tsx). */
export function quoteBlock(h: Highlight, doc: Document) {
  return {
    type: "pdfQuote",
    props: {
      highlightId: h.id,
      documentId: doc.id,
      pageNumber: h.pageNumber,
      color: h.color,
      text: h.text,
      comment: h.comment ?? "",
      source: doc.title,
    },
  };
}

/** The note block for a snip. */
export function snipBlock(s: Snip, doc: Document) {
  return {
    type: "pdfSnip",
    props: {
      snipId: s.id,
      documentId: doc.id,
      pageNumber: s.pageNumber,
      imagePath: s.imagePath,
      source: doc.title,
    },
  };
}

/** Largest snip edge in px; keeps huge full-page snips at a sane file size. */
const MAX_EDGE = 3200;

/**
 * Renders a region of a page straight from the PDF (not a screenshot), at twice the "100%"
 * size so it stays sharp on Retina screens, and stores it as a PNG. Returns the stored path.
 */
export async function renderAndStoreSnip(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  rect: NormRect,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let scale = 2 * PDF_TO_CSS;
  const longest = Math.max(rect.w * base.width, rect.h * base.height) * scale;
  if (longest > MAX_EDGE) scale *= MAX_EDGE / longest;
  const viewport = page.getViewport({ scale });

  const x = Math.floor(rect.x * viewport.width);
  const y = Math.floor(rect.y * viewport.height);
  const w = Math.max(1, Math.ceil(rect.w * viewport.width));
  const h = Math.max(1, Math.ceil(rect.h * viewport.height));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a drawing surface for the snip.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  await page.render({
    canvasContext: ctx,
    canvas,
    viewport,
    transform: [1, 0, 0, 1, -x, -y],
    background: "white",
  }).promise;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the snip."))), "image/png"),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<string>("save_png", bytes);
}
