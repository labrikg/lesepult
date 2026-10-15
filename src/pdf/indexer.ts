import { getDb } from "../lib/db";
import { storedFileUrl } from "../lib/files";
import { documentsToIndex, removeOrphanText, saveDocumentText } from "../lib/pdfTextRepo";
import { useStore } from "../store";
import { openPdf, type PDFDocumentProxy } from "./pdfjs";
import { pageText, type Piece } from "./textMatch";

/*
 * Reads the text of every PDF in the background so search can look inside them. Runs at start
 * (for PDFs added before search existed, or after the extraction improved) and after each import.
 */

interface Item {
  str?: string;
  hasEOL?: boolean;
}

/** PDF.js text items as pieces (one per item that has text, like the text layer's spans). */
export function piecesOf(items: readonly object[]): Piece[] {
  return (items as Item[]).filter((it) => it.str !== undefined).map((it) => ({ text: it.str!, eol: !!it.hasEOL }));
}

/** The text of each page (index 0 = page 1). */
export async function extractPageTexts(pdf: PDFDocumentProxy): Promise<string[]> {
  const texts: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    texts.push(pageText(piecesOf(content.items)));
    page.cleanup();
  }
  return texts;
}

let running = false;
let again = false;

/** Indexes all PDFs that need it. Safe to call often: calls while it runs just queue one more pass. */
export function indexPdfs() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  (async () => {
    do {
      again = false;
      await indexPass();
    } while (again);
  })()
    .catch((e) => console.warn("PDF indexing failed", e))
    .finally(() => {
      running = false;
      useStore.setState({ pdfIndexing: null });
    });
}

async function indexPass() {
  const db = await getDb();
  await removeOrphanText(db);
  const docs = await documentsToIndex(db);
  for (const [i, doc] of docs.entries()) {
    useStore.setState({ pdfIndexing: { done: i, total: docs.length, title: doc.title } });
    let texts: string[] = [];
    try {
      const task = openPdf(await storedFileUrl(doc.storedPath));
      try {
        texts = await extractPageTexts(await task.promise);
      } finally {
        await task.destroy();
      }
    } catch (e) {
      // A broken or missing file is stored as empty, so it isn't retried on every start.
      console.warn(`couldn't read ${doc.title}`, e);
    }
    await saveDocumentText(db, doc.id, texts);
  }
}
