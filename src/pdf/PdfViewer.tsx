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

interface Props {
  doc: Document;
  onReplace(): void;
  onRemove(): void;
}

const positionKey = (docId: string) => `pdfPos:${docId}`;

export function PdfViewer({ doc, onReplace, onRemove }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [viewport, setViewport] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [pageInput, setPageInput] = useState("1");
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

  const goTo = (n: number) => {
    const el = scrollRef.current;
    if (el && layout.tops.length) el.scrollTop = scrollTopFor(layout, n);
  };

  const effectiveZoom = zoom === "fit" ? scale / PDF_TO_CSS : zoom;

  return (
    <section className="pdf-pane" aria-label="PDF viewer">
      <div className="pane-toolbar">
        <span className="mono truncate" title={doc.fileName}>
          {doc.fileName}
        </span>
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

      <div className="pdf-scroll" ref={scrollRef} onScroll={onScroll}>
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
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
