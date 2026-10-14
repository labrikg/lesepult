import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileX2, Maximize2, Minus, Plus, Replace, Scissors } from "lucide-react";
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
import { createSnip, type Highlight, type HighlightColor, type NormRect } from "../lib/repo";
import { useStore } from "../store";
import { cardBlock, quoteBlock, renderAndStoreSnip, snipBlock } from "./toNote";

type Anchor = ViewerSelection["anchor"];

interface Props {
  doc: Document;
  onReplace(): void;
  onRemove(): void;
  onRename(title: string): void;
  /** False when showing another page's PDF after "Jump to page". */
  isPageDoc: boolean;
  onShowPagePdf(): void;
}

const positionKey = (docId: string) => `pdfPos:${docId}`;

export function PdfViewer({ doc, onReplace, onRemove, onRename, isPageDoc, onShowPagePdf }: Props) {
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
  const { highlights, byPage, links, create, update, remove } = useHighlights(doc.id);
  const currentPageId = useStore((s) => s.selectedPageId);
  const linkedIds = useMemo(() => new Set(links.keys()), [links]);
  const [flashId, setFlashId] = useState<string | null>(null);

  const sendToNote = (hs: Highlight[]) => {
    if (hs.length) useStore.getState().sendToNote(hs.map((h) => quoteBlock(h, doc)));
  };

  /** "In note" chip: show the block that quotes this highlight (preferring the open page's note). */
  const openLink = (highlightId: string) => {
    const ls = links.get(highlightId) ?? [];
    const link = ls.find((l) => l.pageId === currentPageId) ?? ls[0];
    if (link) useStore.getState().focusNoteBlock(link.pageId, link.blockId);
  };
  const [selection, setSelection] = useState<ViewerSelection | null>(null);
  const [open, setOpen] = useState<{ id: string; anchor: Anchor; focusComment: boolean } | null>(null);
  const openHighlight = highlights.find((h) => h.id === open?.id) ?? null;

  const highlightSelection = async (color: HighlightColor, then: "none" | "comment" | "note" = "none") => {
    if (!selection) return;
    const made = await create(selection.pages, color);
    window.getSelection()?.removeAllRanges();
    const anchor = selection.anchor;
    setSelection(null);
    if (then === "comment" && made.length)
      setOpen({ id: made[made.length - 1].id, anchor, focusComment: true });
    if (then === "note") sendToNote(made);
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
      } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        highlightSelection("yellow", "note");
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

  /* ---- "Jump to page" from a note block ---- */
  const pdfJump = useStore((s) => s.pdfJump);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!pdfJump || pdfJump.documentId !== doc.id || !el || !layout.tops.length || !scale) return;
    useStore.setState({ pdfJump: null });
    restoreTo.current = null;
    const n = Math.min(Math.max(1, pdfJump.pageNumber), layout.tops.length);
    const h = pdfJump.highlightId ? highlights.find((x) => x.id === pdfJump.highlightId) : undefined;
    const y = h?.rects[0] ? h.rects[0].y * layout.heights[n - 1] : 0;
    // Put the highlight a third of the way down the pane, or the page top at the top.
    el.scrollTop = Math.max(0, layout.tops[n - 1] + y - (h ? viewport.height / 3 : 16));
    setViewport((v) => ({ ...v, scrollTop: el.scrollTop }));
    if (h) {
      setFlashId(h.id);
      window.setTimeout(() => setFlashId((f) => (f === h.id ? null : f)), 1800);
    }
  }, [pdfJump, doc.id, layout, scale, highlights, viewport.height]);

  /* ---- Snip tool ---- */
  const [snipMode, setSnipMode] = useState(false);
  const [snipDraft, setSnipDraft] = useState<{ pageNumber: number; rect: NormRect; done: boolean } | null>(
    null,
  );
  const [snipBusy, setSnipBusy] = useState(false);
  const snipStart = useRef<{ pageNumber: number; x: number; y: number; el: HTMLElement } | null>(null);

  const cancelSnip = useCallback(() => {
    setSnipDraft(null);
    snipStart.current = null;
  }, []);

  useEffect(() => {
    if (!snipMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSnip();
        setSnipMode(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [snipMode, cancelSnip]);

  const pointOnPage = (el: HTMLElement, clientX: number, clientY: number) => {
    const box = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  };

  const snipHandlers = snipMode
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          const pageEl = (e.target as HTMLElement).closest<HTMLElement>(".pdf-page");
          if (!pageEl || e.button !== 0) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const p = pointOnPage(pageEl, e.clientX, e.clientY);
          snipStart.current = { pageNumber: Number(pageEl.dataset.page), ...p, el: pageEl };
          setSnipDraft({
            pageNumber: Number(pageEl.dataset.page),
            rect: { x: p.x, y: p.y, w: 0, h: 0 },
            done: false,
          });
        },
        onPointerMove: (e: React.PointerEvent) => {
          const start = snipStart.current;
          if (!start) return;
          const p = pointOnPage(start.el, e.clientX, e.clientY);
          setSnipDraft({
            pageNumber: start.pageNumber,
            rect: {
              x: Math.min(start.x, p.x),
              y: Math.min(start.y, p.y),
              w: Math.abs(p.x - start.x),
              h: Math.abs(p.y - start.y),
            },
            done: false,
          });
        },
        onPointerUp: () => {
          snipStart.current = null;
          setSnipDraft((d) => (d && d.rect.w > 0.01 && d.rect.h > 0.01 ? { ...d, done: true } : null));
        },
      }
    : {};

  const addSnipToNote = async () => {
    if (!pdf || !snipDraft) return;
    setSnipBusy(true);
    try {
      const imagePath = await renderAndStoreSnip(pdf, snipDraft.pageNumber, snipDraft.rect);
      const snip = await createSnip(await getDb(), {
        documentId: doc.id,
        pageNumber: snipDraft.pageNumber,
        rect: snipDraft.rect,
        imagePath,
      });
      useStore.getState().sendToNote([snipBlock(snip, doc)]);
      cancelSnip();
      setSnipMode(false);
    } catch (e) {
      useStore.setState({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSnipBusy(false);
    }
  };

  /** Screen position of the finished snip box, for its toolbar. */
  const snipAnchor = (() => {
    if (!snipDraft?.done) return null;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `.pdf-page[data-page="${snipDraft.pageNumber}"]`,
    );
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const r = snipDraft.rect;
    return { right: b.left + (r.x + r.w) * b.width, bottom: b.top + (r.y + r.h) * b.height };
  })();

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
          aria-label="Snip a region into the note"
          title="Snip a region into the note (Esc to stop)"
          aria-pressed={snipMode}
          onClick={() => {
            cancelSnip();
            setSnipMode((m) => !m);
          }}
        >
          <Scissors size={16} aria-hidden="true" />
        </button>
        {isPageDoc ? (
          <>
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
          </>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onShowPagePdf}>
            <ArrowLeft size={14} aria-hidden="true" />
            This page's PDF
          </button>
        )}
      </div>

      {snipMode && !snipDraft?.done && (
        <div className="snip-hint" role="status">
          Drag over the part of the page you want to snip · Esc to cancel
        </div>
      )}
      <div
        className={`pdf-scroll${snipMode ? " is-snipping" : ""}`}
        ref={scrollRef}
        onScroll={() => {
          onScroll();
          if (selection) setSelection(null);
          if (open) setOpen(null);
          if (snipDraft?.done) cancelSnip();
        }}
        onMouseUp={snipMode ? undefined : onMouseUp}
        {...snipHandlers}
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
                  activeHighlightId={open?.id ?? flashId}
                  flashHighlightId={flashId}
                  linkedIds={linkedIds}
                  onOpenLink={openLink}
                  onOpenHighlight={(id, anchor) => setOpen({ id, anchor, focusComment: false })}
                  snipRect={snipDraft?.pageNumber === n ? snipDraft.rect : null}
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
          onComment={() => highlightSelection("yellow", "comment")}
          onSendToNote={() => highlightSelection("yellow", "note")}
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
          inNote={linkedIds.has(openHighlight.id)}
          onSendToNote={(comment) => {
            sendToNote([{ ...openHighlight, comment: comment.trim() || null }]);
            setOpen(null);
          }}
          onMakeCard={() => {
            useStore.getState().sendToNote([cardBlock(openHighlight)]);
            setOpen(null);
          }}
        />
      )}
      {snipAnchor && (
        <div
          className="snip-toolbar"
          role="toolbar"
          aria-label="Snip"
          style={{
            top: Math.min(window.innerHeight - 56, snipAnchor.bottom + 8),
            left: Math.min(window.innerWidth - 230, Math.max(8, snipAnchor.right - 222)),
          }}
        >
          <button type="button" className="btn btn--ghost btn--sm" onClick={cancelSnip}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={addSnipToNote}
            disabled={snipBusy}
          >
            <Scissors size={14} aria-hidden="true" />
            {snipBusy ? "Adding…" : "Add snip to note"}
          </button>
        </div>
      )}
    </section>
  );
}
