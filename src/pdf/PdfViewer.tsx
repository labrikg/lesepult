import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileX2, Maximize2, Minus, Plus, Replace } from "lucide-react";
import { openPdf, type PDFDocumentProxy } from "./pdfjs";
import { PdfPage } from "./PdfPage";
import {
  computeLayout,
  currentPage,
  PAGE_PADDING,
  PDF_TO_CSS,
  positionAt,
  scaleFor,
  scrollTopFor,
  visibleRange,
  type Size,
  type Zoom,
  zoomIn,
  zoomOut,
} from "./layout";
import { storedFileUrl } from "../lib/files";
import { getDb } from "../lib/db";
import { kvGet, kvSet, setDocumentPageCount, type Document } from "../lib/repo";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { InlineInput } from "../components/InlineInput";
import { useHighlights } from "./useHighlights";
import { readSelection, type ViewerSelection } from "./selection";
import { HighlightPopover, SelectionToolbar } from "./HighlightMenus";
import { hitTest, HIGHLIGHT_COLORS } from "./highlights";
import type { HighlightColor } from "../lib/repo";

type Anchor = ViewerSelection["anchor"];

interface Props {
  doc: Document;
  onReplace(): void;
  onRemove(): void;
  onRename(title: string): void;
}

const positionKey = (docId: string) => `pdfPos:${docId}`;

export function PdfViewer({ doc, onReplace, onRemove, onRename }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [viewport, setViewport] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [pageInput, setPageInput] = useState("1");
  const [renaming, setRenaming] = useState(false);
  const restoreTo = useRef<{ page: number; fraction: number } | null>(null);

  /* ---- Load the document ---- */
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof openPdf> | null = null;
    setPdf(null);
    setSizes([]);
    setError(null);

    (async () => {
      const db = await getDb();
      const saved = await kvGet(db, positionKey(doc.id));
      if (saved) {
        const [page, fraction] = saved.split(":").map(Number);
        if (page > 0) restoreTo.current = { page, fraction: fraction || 0 };
      }
      task = openPdf(await storedFileUrl(doc.storedPath));
      const loaded = await task.promise;
      const pageSizes = await Promise.all(
        Array.from({ length: loaded.numPages }, (_, i) =>
          loaded.getPage(i + 1).then((p) => {
            const v = p.getViewport({ scale: 1 });
            return { w: v.width, h: v.height };
          }),
        ),
      );
      if (cancelled) return;
      setPdf(loaded);
      setSizes(pageSizes);
      setDocumentPageCount(db, doc.id, loaded.numPages).catch(() => {});
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [doc.id, doc.storedPath]);

  /* ---- Track the viewport size ---- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setViewport((v) => ({ ...v, width: el.clientWidth, height: el.clientHeight })),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = viewport.width ? scaleFor(zoom, viewport.width, sizes) : 0;
  const layout = useMemo(() => computeLayout(sizes, scale), [sizes, scale]);
  const contentWidth = Math.max(0, ...layout.widths) + PAGE_PADDING * 2;
  const page = currentPage(layout, viewport.scrollTop, viewport.height);
  const [first, last] = visibleRange(layout, viewport.scrollTop, viewport.height);

  /* ---- Keep the reading position when the scale changes, restore it after loading ---- */
  const lastLayout = useRef(layout);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout.tops.length || !scale) return;
    const target =
      restoreTo.current ??
      (lastLayout.current.tops.length && lastLayout.current !== layout
        ? positionAt(lastLayout.current, el.scrollTop)
        : null);
    restoreTo.current = null;
    lastLayout.current = layout;
    if (target) {
      el.scrollTop = scrollTopFor(layout, target.page, target.fraction);
      // When zoomed in past the pane width, keep the page centred horizontally.
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      setViewport((v) => ({ ...v, scrollTop: el.scrollTop }));
    }
  }, [layout, scale]);

  /* ---- Scroll tracking (one update per frame) + remembering the position ---- */
  const frame = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setViewport((v) => ({ ...v, scrollTop: el.scrollTop }));
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const pos = positionAt(lastLayout.current, el.scrollTop);
        kvSet(await getDb(), positionKey(doc.id), `${pos.page}:${pos.fraction.toFixed(3)}`);
      }, 500);
    });
  }, [doc.id]);

  useEffect(() => setPageInput(String(page)), [page]);

  /* ---- Highlights ---- */
  const { highlights, byPage, create, update, remove } = useHighlights(doc.id);
  const [selection, setSelection] = useState<ViewerSelection | null>(null);
  const [open, setOpen] = useState<{ id: string; anchor: Anchor; focusComment: boolean } | null>(null);
  const openHighlight = highlights.find((h) => h.id === open?.id) ?? null;

  const highlightSelection = async (color: HighlightColor, thenComment = false) => {
    if (!selection) return;
    const made = await create(selection.pages, color);
    window.getSelection()?.removeAllRanges();
    const anchor = selection.anchor;
    setSelection(null);
    if (thenComment && made.length) setOpen({ id: made[made.length - 1].id, anchor, focusComment: true });
  };

  // After a mouse-up: a text selection gets the colour toolbar; a plain click on a highlight opens it.
  const onMouseUp = (e: React.MouseEvent) => {
    const { clientX, clientY, target } = e;
    window.setTimeout(() => {
      const root = scrollRef.current;
      if (!root) return;
      const sel = readSelection(root);
      if (sel) {
        setOpen(null);
        setSelection(sel);
        return;
      }
      setSelection(null);
      const pageEl = (target as HTMLElement).closest<HTMLElement>(".pdf-page");
      if (!pageEl) return;
      const box = pageEl.getBoundingClientRect();
      const x = (clientX - box.left) / box.width;
      const y = (clientY - box.top) / box.height;
      const hit = [...(byPage.get(Number(pageEl.dataset.page)) ?? [])]
        .reverse()
        .find((h) => hitTest(h.rects, x, y));
      if (hit) {
        const r = hit.rects[hit.rects.length - 1];
        setOpen({
          id: hit.id,
          focusComment: false,
          anchor: {
            left: box.left + r.x * box.width,
            top: box.top + r.y * box.height,
            right: box.left + (r.x + r.w) * box.width,
            bottom: box.top + (r.y + r.h) * box.height,
          },
        });
      }
    }, 0);
  };

  // The toolbar follows the selection: hide it when the selection goes away or the view scrolls.
  useEffect(() => {
    if (!selection) return;
    const onChange = () => {
      if (window.getSelection()?.isCollapsed) setSelection(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        highlightSelection(HIGHLIGHT_COLORS[i].id);
      } else if (e.key === "Escape") {
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      }
    };
    document.addEventListener("selectionchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
    // highlightSelection is recreated every render; the selection is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const goTo = (n: number) => {
    const el = scrollRef.current;
    if (el && layout.tops.length) el.scrollTop = scrollTopFor(layout, n);
  };

  const effectiveZoom = zoom === "fit" ? scale / PDF_TO_CSS : zoom;

  return (
    <section className="pdf-pane" aria-label="PDF viewer">
      <div className="pane-toolbar">
        {renaming ? (
          <InlineInput
            className="pdf-title-input"
            label="Rename PDF"
            placeholder="PDF title"
            initial={doc.title}
            onSubmit={(t) => {
              setRenaming(false);
              onRename(t);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className="pdf-title truncate"
            title={`${doc.fileName} · click to rename`}
            onClick={() => setRenaming(true)}
          >
            {doc.title}
          </button>
        )}
        <form
          className="page-jump"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(pageInput);
            if (n >= 1 && n <= sizes.length) goTo(n);
            else setPageInput(String(page));
          }}
        >
          <span>p.</span>
          <input
            aria-label="Page number"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageInput(String(page))}
          />
          <span>/ {sizes.length || "–"}</span>
        </form>

        <div className="toolbar-spacer" />

        <div className="zoom-group" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom(zoomOut(effectiveZoom))}>
            <Minus size={15} aria-hidden="true" />
          </button>
          <span className="zoom-value">{Math.round(effectiveZoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom(zoomIn(effectiveZoom))}>
            <Plus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Fit width"
            title="Fit width"
            aria-pressed={zoom === "fit"}
            onClick={() => setZoom("fit")}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        </div>

        <span className="toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="tool-btn"
          aria-label="Replace PDF"
          title="Replace PDF"
          onClick={onReplace}
        >
          <Replace size={16} aria-hidden="true" />
        </button>
        <ConfirmDelete
          what="PDF from this page"
          onConfirm={onRemove}
          icon={<FileX2 size={16} aria-hidden="true" />}
        />
      </div>

      <div
        className="pdf-scroll"
        ref={scrollRef}
        onScroll={() => {
          onScroll();
          if (selection) setSelection(null);
          if (open) setOpen(null);
        }}
        onMouseUp={onMouseUp}
      >
        {error ? (
          <div className="pdf-message" role="alert">
            Couldn't open this PDF: {error}
          </div>
        ) : !pdf ? (
          <div className="pdf-message">Opening {doc.title}…</div>
        ) : (
          <div
            className="pdf-content"
            style={{ height: layout.totalHeight, width: `max(100%, ${contentWidth}px)` }}
          >
            {Array.from({ length: Math.max(0, last - first + 1) }, (_, k) => {
              const n = first + k;
              return (
                <PdfPage
                  key={n}
                  pdf={pdf}
                  pageNumber={n}
                  scale={scale}
                  top={layout.tops[n - 1]}
                  width={layout.widths[n - 1]}
                  height={layout.heights[n - 1]}
                  highlights={byPage.get(n) ?? []}
                  activeHighlightId={open?.id ?? null}
                  onOpenHighlight={(id, anchor) => setOpen({ id, anchor, focusComment: false })}
                />
              );
            })}
          </div>
        )}
      </div>
      {selection && (
        <SelectionToolbar
          anchor={selection.anchor}
          onPick={(c) => highlightSelection(c)}
          onComment={() => highlightSelection("yellow", true)}
        />
      )}
      {open && openHighlight && (
        <HighlightPopover
          key={openHighlight.id}
          highlight={openHighlight}
          anchor={open.anchor}
          focusComment={open.focusComment}
          onColor={(color) => update(openHighlight.id, { color })}
          onComment={(comment) => update(openHighlight.id, { comment })}
          onDelete={() => {
            remove(openHighlight.id);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
