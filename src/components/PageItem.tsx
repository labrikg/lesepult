import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  FileText,
  FolderInput,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { useStore } from "../store";
import type { PageSummary } from "../lib/repo";
import { InlineInput } from "./InlineInput";
import { Popover } from "./Popover";

/** Drag payload type for moving pages between courses. */
export const PAGE_DRAG_TYPE = "application/x-studyhub-page";

export function PageItem({ page }: { page: PageSummary }) {
  const selectedPageId = useStore((s) => s.selectedPageId);
  const { selectPage, savePage } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  if (renaming) {
    return (
      <div className="page-row page-row--editing">
        <InlineInput
          label="Rename page"
          placeholder="Page title"
          initial={page.title}
          onSubmit={(title) => {
            setRenaming(false);
            savePage(page.id, { title });
          }}
          onCancel={() => setRenaming(false)}
        />
      </div>
    );
  }

  return (
    <div className="row page-row">
      <button
        type="button"
        className="page-item"
        draggable
        aria-current={page.id === selectedPageId ? "page" : undefined}
        onClick={() => selectPage(page.id)}
        onDoubleClick={() => setRenaming(true)}
        onDragStart={(e) => {
          e.dataTransfer.setData(PAGE_DRAG_TYPE, page.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        title="Double-click to rename · drag onto a course to move"
      >
        <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
        <span className="truncate">{page.title || "Untitled"}</span>
        {page.documentId && (
          <Paperclip size={13} className="row-meta-icon" aria-label="Has a PDF" role="img" />
        )}
      </button>
      <div className="row-actions" data-open={menuOpen || undefined}>
        <button
          ref={menuButton}
          type="button"
          className="row-action"
          aria-label={`More actions for ${page.title || "Untitled"}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </div>
      {menuOpen && (
        <PageMenu
          page={page}
          anchor={menuButton}
          onClose={closeMenu}
          onRename={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
        />
      )}
    </div>
  );
}

interface MenuProps {
  page: PageSummary;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onRename(): void;
}

function PageMenu({ page, anchor, onClose, onRename }: MenuProps) {
  const tree = useStore((s) => s.tree);
  const { movePage, deletePage } = useStore.getState();
  const [view, setView] = useState<"main" | "move">("main");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Popover
      key={view}
      anchor={anchor}
      onClose={onClose}
      label="Page actions"
      width={view === "move" ? 270 : 220}
    >
      {view === "main" ? (
        <>
          <button type="button" role="menuitem" className="menu-item" onClick={onRename}>
            <Pencil size={15} aria-hidden="true" />
            Rename
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => setView("move")}>
            <FolderInput size={15} aria-hidden="true" />
            Move to course…
          </button>
          <div className="menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`menu-item menu-item--danger${confirmDelete ? " is-armed" : ""}`}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onClose();
              deletePage(page.id);
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            {confirmDelete ? "Click again to delete" : "Delete page"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item--back"
            onClick={() => setView("main")}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Move “{page.title || "Untitled"}” to…
          </button>
          <div className="menu-divider" role="separator" />
          <div className="menu-scroll">
            {tree.map((s) => (
              <div key={s.id} role="group" aria-label={s.name}>
                <div className="menu-label">{s.name}</div>
                {s.courses.map((c) => {
                  const here = c.id === page.courseId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      disabled={here}
                      onClick={() => {
                        onClose();
                        movePage(page.id, c.id);
                      }}
                    >
                      <span className="course-dot" style={{ background: c.color }} aria-hidden="true" />
                      <span className="truncate">{c.name}</span>
                      {here && (
                        <Check size={14} className="menu-check" aria-label="Current course" role="img" />
                      )}
                    </button>
                  );
                })}
                {s.courses.length === 0 && <div className="menu-empty">No courses</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}
