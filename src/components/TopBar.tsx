import { Columns2, Download, FileText, NotebookPen } from "lucide-react";
import { locatePage, useStore, type ViewMode } from "../store";

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

      <button type="button" className="btn btn--ghost" disabled title="Coming soon">
        <Download size={15} aria-hidden="true" />
        Export note
      </button>
    </header>
  );
}
