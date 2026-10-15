import type { Db } from "./db";
import { parseSearch } from "./repo";
import { makeSnippet, queryTerms } from "../pdf/textMatch";

/*
 * SQL for searching inside PDFs: every page's text sits in pdf_text_fts (trigram tokenizer, so
 * parts of words match). A document's text is (re)built when `text_indexed` is behind
 * PDF_TEXT_VERSION, e.g. after the extraction improves.
 */

/** Bump when the extraction changes, so existing PDFs are read again. */
export const PDF_TEXT_VERSION = 1;

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0);

export interface DocToIndex {
  id: string;
  title: string;
  storedPath: string;
}

/** PDFs whose text isn't indexed yet (or with an older extraction), newest first. */
export async function documentsToIndex(db: Db): Promise<DocToIndex[]> {
  const rows = await db.select<Row>(
    `SELECT id, title, stored_path FROM documents
      WHERE text_indexed IS NULL OR text_indexed < $1
      ORDER BY created_at DESC`,
    [PDF_TEXT_VERSION],
  );
  return rows.map((r) => ({ id: str(r.id), title: str(r.title), storedPath: str(r.stored_path) }));
}

/** Replaces a document's page texts (index 0 = page 1) and marks it indexed. */
export async function saveDocumentText(db: Db, documentId: string, pages: readonly string[]) {
  await db.execute("DELETE FROM pdf_text_fts WHERE document_id = $1", [documentId]);
  const rows = pages.map((text, i) => ({ page: i + 1, text })).filter((p) => p.text.trim());
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const params: unknown[] = [documentId];
    const values = chunk.map((p) => {
      params.push(p.page, p.text);
      return `($1, $${params.length - 1}, $${params.length})`;
    });
    await db.execute(`INSERT INTO pdf_text_fts (document_id, page_number, text) VALUES ${values.join(", ")}`, params);
  }
  await db.execute("UPDATE documents SET text_indexed = $1 WHERE id = $2", [PDF_TEXT_VERSION, documentId]);
  // Deleted while it was being read: drop what was just written.
  await removeOrphanText(db);
}

/** Text left over from PDFs that no longer exist. */
export async function removeOrphanText(db: Db) {
  await db.execute("DELETE FROM pdf_text_fts WHERE document_id NOT IN (SELECT id FROM documents)");
}

/** A document's stored page texts by page number, or null if it hasn't been indexed yet. */
export async function documentPageTexts(db: Db, documentId: string): Promise<Map<number, string> | null> {
  const doc = await db.select<Row>("SELECT text_indexed FROM documents WHERE id = $1", [documentId]);
  if (doc[0]?.text_indexed == null || num(doc[0].text_indexed) < PDF_TEXT_VERSION) return null;
  const rows = await db.select<Row>("SELECT page_number, text FROM pdf_text_fts WHERE document_id = $1", [
    documentId,
  ]);
  return new Map(rows.map((r) => [num(r.page_number), str(r.text)]));
}

export interface PdfHit {
  documentId: string;
  /** The note page the PDF belongs to. */
  pageId: string;
  title: string;
  courseName: string;
  courseColor: string;
  /** The best matching page and an excerpt from it (matches in \u0002 … \u0003). */
  pageNumber: number;
  snippet: string;
  /** Every matching page, in order. */
  pages: number[];
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Searches the text of all PDFs. Each word must occur on the page (anywhere in a word, ignoring
 * case and accents); "#tag" words narrow it to PDFs of notes with that tag. One hit per PDF,
 * best first.
 */
export async function searchPdfs(db: Db, input: string, limit = 8): Promise<PdfHit[]> {
  const { text, tags } = parseSearch(input);
  const words = [...new Set(text.split(/\s+/).map((w) => w.replace(/"/g, "")).filter(Boolean))];
  if (!words.length) return [];
  // The trigram index needs three characters; shorter words are checked with LIKE.
  const long = words.filter((w) => [...w].length >= 3);
  const short = words.filter((w) => [...w].length < 3);

  const params: unknown[] = [];
  const where: string[] = [];
  if (long.length) {
    params.push(long.map((w) => `"${w}"`).join(" "));
    where.push(`pdf_text_fts MATCH $${params.length}`);
  }
  for (const w of short) {
    params.push(`%${escapeLike(w)}%`);
    where.push(`f.text LIKE $${params.length} ESCAPE '\\'`);
  }
  for (const t of tags) {
    params.push(`${escapeLike(t)}%`);
    where.push(`EXISTS (SELECT 1 FROM pages p JOIN page_tags pt ON pt.page_id = p.id JOIN tags t ON t.id = pt.tag_id
                         WHERE p.document_id = d.id AND t.name LIKE $${params.length} ESCAPE '\\')`);
  }
  const rows = await db.select<Row>(
    `SELECT f.document_id, f.page_number, f.text, d.title, c.name AS course_name, c.color AS course_color,
            (SELECT p.id FROM pages p WHERE p.document_id = d.id ORDER BY p.position LIMIT 1) AS page_id
       FROM pdf_text_fts f
       JOIN documents d ON d.id = f.document_id
       JOIN courses c ON c.id = d.course_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${long.length ? "f.rank" : "d.created_at DESC, f.page_number"}
      LIMIT 400`,
    params,
  );

  const terms = queryTerms(words.join(" "));
  const hits = new Map<string, PdfHit>();
  for (const r of rows) {
    const pageId = str(r.page_id);
    if (!pageId) continue; // a PDF no note shows (shouldn't happen)
    const id = str(r.document_id);
    const pageNumber = num(r.page_number);
    const hit = hits.get(id);
    if (hit) {
      hit.pages.push(pageNumber);
    } else if (hits.size < limit) {
      hits.set(id, {
        documentId: id,
        pageId,
        title: str(r.title),
        courseName: str(r.course_name),
        courseColor: str(r.course_color),
        pageNumber,
        snippet: makeSnippet(str(r.text), terms),
        pages: [pageNumber],
      });
    }
  }
  for (const h of hits.values()) h.pages.sort((a, b) => a - b);
  return [...hits.values()];
}
