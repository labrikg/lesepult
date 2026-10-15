import { Fragment, useEffect, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import { useStore } from "../store";
import { getDb } from "../lib/db";
import { searchPages, type SearchHit } from "../lib/repo";
import { searchPdfs, type PdfHit } from "../lib/pdfTextRepo";
import { TagChip } from "./Tags";

/** Renders an FTS snippet, turning the \u0002…\u0003 markers into <mark>. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("\u0002") ? (
          <mark key={i}>{part.slice(1, -1)}</mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

type Result = { kind: "note"; hit: SearchHit } | { kind: "pdf"; hit: PdfHit };

/** How many other matching pages a PDF hit lists before "+N". */
const MORE_PAGES = 6;

export function SearchDialog() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const selectPage = useStore((s) => s.selectPage);
  const openPdfHit = useStore((s) => s.openPdfHit);
  const indexing = useStore((s) => s.pdfIndexing);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ notes: SearchHit[]; pdfs: PdfHit[] }>({ notes: [], pdfs: [] });
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // ⌘K / Ctrl+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (open) setQuery("");
  }, [open]);

  // Searches again when the query changes, and when indexing finishes a PDF.
  const indexed = indexing?.done;
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const db = await getDb();
      const q = query.trim();
      const [notes, pdfs] = q ? await Promise.all([searchPages(db, q), searchPdfs(db, q)]) : [[], []];
      if (!cancelled) {
        setResults({ notes, pdfs });
        setActive((a) => (indexed === undefined ? 0 : a));
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, indexed]);

  const flat: Result[] = [
    ...results.notes.map((hit) => ({ kind: "note" as const, hit })),
    ...results.pdfs.map((hit) => ({ kind: "pdf" as const, hit })),
  ];

  // Keep the active row in view while moving with the arrow keys.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (r: Result | undefined, pageNumber?: number) => {
    if (!r) return;
    setOpen(false);
    if (r.kind === "note") selectPage(r.hit.pageId);
    else openPdfHit(r.hit.pageId, r.hit.documentId, pageNumber ?? r.hit.pageNumber, query.trim());
  };

  const q = query.trim();
  const nothing = q && flat.length === 0;

  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label="Search notes and PDFs"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === dialog.current) setOpen(false);
      }}
    >
      <div className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          autoFocus
          aria-label="Search query"
          placeholder="Search notes and PDFs… (#tag to filter)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              choose(flat[active]);
            }
          }}
        />
      </div>

      {q && (
        <ul className="search-results" role="listbox" aria-label="Results" ref={list}>
          {nothing && <li className="search-empty">Nothing matches “{q}”.</li>}
          {results.notes.length > 0 && (
            <li className="search-section" role="presentation">
              Notes
            </li>
          )}
          {results.notes.map((h, i) => (
            <li key={h.pageId} role="option" aria-selected={i === active} data-index={i}>
              <button
                type="button"
                className="search-hit-main"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose({ kind: "note", hit: h })}
              >
                <span className="search-hit-head">
                  <span className="course-dot" style={{ background: h.courseColor }} aria-hidden="true" />
                  <span className="search-hit-title">{h.title || "Untitled"}</span>
                  {h.tags.map((t) => (
                    <TagChip key={t.id} tag={t} />
                  ))}
                  <span className="row-meta">{h.courseName}</span>
                </span>
                {h.snippet && (
                  <span className="search-hit-snippet">
                    <Snippet text={h.snippet} />
                  </span>
                )}
              </button>
            </li>
          ))}
          {results.pdfs.length > 0 && (
            <li className="search-section" role="presentation">
              In PDFs
            </li>
          )}
          {results.pdfs.map((h, k) => {
            const i = results.notes.length + k;
            const others = h.pages.filter((p) => p !== h.pageNumber);
            return (
              <li key={h.documentId} role="option" aria-selected={i === active} data-index={i}>
                <button
                  type="button"
                  className="search-hit-main"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose({ kind: "pdf", hit: h })}
                >
                  <span className="search-hit-head">
                    <FileText size={14} className="search-pdf-icon" style={{ color: h.courseColor }} aria-hidden="true" />
                    <span className="search-hit-title truncate">{h.title}</span>
                    <span className="search-page-badge">p. {h.pageNumber}</span>
                    <span className="row-meta">{h.courseName}</span>
                  </span>
                  <span className="search-hit-snippet">
                    <Snippet text={h.snippet} />
                  </span>
                </button>
                {others.length > 0 && (
                  <div className="search-more-pages" onMouseEnter={() => setActive(i)}>
                    <span>Also on</span>
                    {others.slice(0, MORE_PAGES).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="search-page-link"
                        aria-label={`${h.title}, page ${p}`}
                        onClick={() => choose({ kind: "pdf", hit: h }, p)}
                      >
                        p. {p}
                      </button>
                    ))}
                    {others.length > MORE_PAGES && <span>+{others.length - MORE_PAGES} more</span>}
                  </div>
                )}
              </li>
            );
          })}
          {indexing && (
            <li className="search-indexing" role="presentation">
              Reading PDFs for search… {indexing.done + 1} of {indexing.total}
            </li>
          )}
        </ul>
      )}
    </dialog>
  );
}
