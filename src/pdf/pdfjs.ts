// The legacy build: the same PDF.js plus fallbacks (core-js) for JavaScript features that only the
// newest browser engines have, e.g. Uint8Array.prototype.toHex. The app runs in the system's web
// view (WebView2 on Windows, WebKit on macOS and Linux), which can be a few versions behind; with
// the plain build PDFs failed to open there ("toHex is not a function"). Engines that have the
// features natively still use them.
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Opens a PDF with all helper assets served locally (see scripts/copy-pdfjs-assets.mjs). */
export function openPdf(url: string): PDFDocumentLoadingTask {
  return getDocument({
    url,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
    // Keeps real font names (e.g. CMMI10) so formulas can be recognised in selected text.
    fontExtraProperties: true,
  });
}
