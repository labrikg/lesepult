import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDb } from "../lib/db";
import { documentPageTexts } from "../lib/pdfTextRepo";
import { extractPageTexts } from "./indexer";
import type { PDFDocumentProxy } from "./pdfjs";
import { countMatches, queryTerms } from "./textMatch";

export interface FindSpot {
  page: number;
  /** Which match on that page (0-based). */
  index: number;
}

/**
 * Find in the open PDF: counts matches per page from the page texts (the search index, or read
 * from the PDF if it isn't indexed yet) and steps through them. The pages draw the matches.
 */
export function usePdfFind(docId: string, pdf: PDFDocumentProxy | null, currentPage: number) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [texts, setTexts] = useState<Map<number, string> | null>(null);
  const [current, setCurrent] = useState<FindSpot | null>(null);
  /** Bumped to make the page with the current match scroll it into view. */
  const [reveal, setReveal] = useState(0);
  /** Where the next search starts (a page from ⌘K), instead of the page in view. */
  const startAt = useRef<number | null>(null);
  const [restart, setRestart] = useState(0);
  const pageNow = useRef(currentPage);
  pageNow.current = currentPage;

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  // Page texts, loaded the first time find opens.
  useEffect(() => {
    if (!open || texts || !pdf) return;
    let cancelled = false;
    (async () => {
      const stored = await documentPageTexts(await getDb(), docId);
      const loaded = stored ?? new Map((await extractPageTexts(pdf)).map((t, i) => [i + 1, t]));
      if (!cancelled) setTexts(loaded);
    })().catch((e) => console.warn("find: couldn't read the PDF's text", e));
    return () => {
      cancelled = true;
    };
  }, [open, texts, pdf, docId]);

  // Single letters would light up the whole page.
  const terms = useMemo(() => (open ? queryTerms(debounced).filter((t) => t.length >= 2) : []), [open, debounced]);

  const counts = useMemo(() => {
    if (!texts || !terms.length) return [];
    return [...texts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, text]) => ({ page, n: countMatches(text, terms) }))
      .filter((c) => c.n > 0);
  }, [texts, terms]);
  const total = counts.reduce((sum, c) => sum + c.n, 0);

  // A new search starts at the first match from the page in view (or the page asked for).
  useEffect(() => {
    if (!counts.length) {
      setCurrent(null);
      return;
    }
    const from = startAt.current ?? pageNow.current;
    startAt.current = null;
    const c = counts.find((x) => x.page >= from) ?? counts[0];
    setCurrent({ page: c.page, index: 0 });
    setReveal((r) => r + 1);
  }, [counts, restart]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!total) return;
      let k = 0;
      if (current) {
        for (const c of counts) {
          if (c.page === current.page) {
            k += Math.min(current.index, c.n - 1);
            break;
          }
          k += c.n;
        }
      }
      k = (k + dir + total) % total;
      for (const c of counts) {
        if (k < c.n) {
          setCurrent({ page: c.page, index: k });
          break;
        }
        k -= c.n;
      }
      setReveal((r) => r + 1);
    },
    [counts, current, total],
  );

  let position = 0;
  if (current) {
    for (const c of counts) {
      if (c.page === current.page) {
        position += Math.min(current.index, c.n - 1) + 1;
        break;
      }
      position += c.n;
    }
  }

  /** Opens find, optionally with a query and a page to start from. */
  const show = useCallback((q?: string, page?: number) => {
    setOpen(true);
    if (q !== undefined) {
      startAt.current = page ?? null;
      setQuery(q);
      setDebounced(q);
      setRestart((n) => n + 1);
    }
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setCurrent(null);
  }, []);

  return {
    open,
    query,
    setQuery,
    show,
    close,
    terms,
    total,
    /** 1-based number of the current match. */
    position,
    current,
    reveal,
    /** Still reading the PDF's text. */
    loading: open && !texts,
    next: () => step(1),
    prev: () => step(-1),
  };
}
