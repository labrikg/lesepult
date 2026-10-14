import { Fragment, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "../store";
import { getDb } from "../lib/db";
import { searchPages, type SearchHit } from "../lib/repo";

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

export function SearchDialog() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const selectPage = useStore((s) => s.selectPage);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const results = query.trim() ? await searchPages(await getDb(), query) : [];
      if (!cancelled) {
        setHits(results);
        setActive(0);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    selectPage(hit.pageId);
  };

  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label="Search notes"
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
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              choose(hits[active]);
            }
          }}
        />
      </div>

      {query.trim() && (
        <ul className="search-results" role="listbox" aria-label="Results">
          {hits.length === 0 && <li className="search-empty">No notes match “{query.trim()}”.</li>}
          {hits.map((h, i) => (
            <li key={h.pageId} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(h)}>
                <span className="search-hit-head">
                  <span className="course-dot" style={{ background: h.courseColor }} aria-hidden="true" />
                  <span className="search-hit-title">{h.title || "Untitled"}</span>
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
        </ul>
      )}
    </dialog>
  );
}
