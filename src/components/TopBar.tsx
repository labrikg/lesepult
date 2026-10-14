import { useCallback, useRef, useState } from "react";
import { Columns2, Download, FileDown, FileText, NotebookPen, Printer } from "lucide-react";
import { locatePage, useStore, type ViewMode } from "../store";
import { exportNoteMarkdown, exportNotePdf } from "../export/exporter";
import { Popover } from "./Popover";

const MODES: { mode: ViewMode; label: string; Icon: typeof Columns2 }[] = [
  { mode: "pdf", label: "PDF", Icon: FileText },
  { mode: "split", label: "Split", Icon: Columns2 },
  { mode: "note", label: "Note", Icon: NotebookPen },
];

export function TopBar() {
  const tree = useStore((s) => s.tree);
  const selectedPageId = useStore((s) => s.selectedPageId);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const where = locatePage(tree, selectedPageId);
  const [exportOpen, setExportOpen] = useState(false);
  const exportButton = useRef<HTMLButtonElement>(null);
  const closeExport = useCallback(() => setExportOpen(false), []);

  return (
    <header className="topbar">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {where ? (
          <>
            <span>{where.semester.name}</span>
            <span aria-hidden="true">/</span>
            <span>{where.course.name}</span>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb-current">{where.page.title || "Untitled"}</span>
          </>
        ) : (
          <span className="breadcrumb-current">Study Hub</span>
        )}
      </nav>

      <div className="segmented" role="group" aria-label="View mode">
        {MODES.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={viewMode === mode}
            disabled={!where}
            onClick={() => setViewMode(mode)}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <button
        ref={exportButton}
        type="button"
        className="btn btn--ghost"
        disabled={!where}
        aria-haspopup="menu"
        aria-expanded={exportOpen}
        onClick={() => setExportOpen((o) => !o)}
      >
        <Download size={15} aria-hidden="true" />
        Export note
      </button>
      {exportOpen && (
        <Popover anchor={exportButton} onClose={closeExport} label="Export note" width={268}>
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item--two-line"
            onClick={() => {
              closeExport();
              exportNoteMarkdown();
            }}
          >
            <FileDown size={16} aria-hidden="true" />
            <span>
              <span className="menu-item-title">Markdown file…</span>
              <span className="menu-item-sub">Text, formulas and quotes; snips as images</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item--two-line"
            onClick={() => {
              closeExport();
              exportNotePdf();
            }}
          >
            <Printer size={16} aria-hidden="true" />
            <span>
              <span className="menu-item-title">PDF…</span>
              <span className="menu-item-sub">Opens the print dialog, choose “Save as PDF”</span>
            </span>
          </button>
        </Popover>
      )}
    </header>
  );
}
