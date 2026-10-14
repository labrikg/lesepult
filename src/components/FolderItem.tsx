import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FilePlus,
  Folder as FolderIcon,
  FolderInput,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useStore } from "../store";
import type { CourseNode, Folder } from "../lib/repo";
import { InlineInput } from "./InlineInput";
import { Popover } from "./Popover";
import { PageItem } from "./PageItem";
import { Destinations, subtreeIds } from "./Destinations";
import { dropZone, endDrag, startDrag, useDropTarget } from "./dnd";

/** The folders and pages directly inside a course (parentId null) or a folder. */
export function TreeLevel({
  course,
  parentId,
  filtered,
}: {
  course: CourseNode;
  parentId: string | null;
  filtered: boolean;
}) {
  const folders = course.folders.filter((f) => f.parentId === parentId);
  const pages = course.pages.filter((p) => p.folderId === parentId);
  return (
    <>
      {folders.map((f) => (
        <FolderItem key={f.id} folder={f} course={course} filtered={filtered} />
      ))}
      {pages.map((p) => (
        <PageItem key={p.id} page={p} />
      ))}
    </>
  );
}

function FolderItem({ folder, course, filtered }: { folder: Folder; course: CourseNode; filtered: boolean }) {
  const { toggleFolder, renameFolder, addPage, addFolder, movePage, moveFolder } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const dropKey = `folder:${folder.id}`;
  const isDropTarget = useDropTarget((s) => s.over === dropKey);
  const open = !folder.collapsed;
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = open ? FolderOpen : FolderIcon;
  const isEmpty = !course.folders.some((f) => f.parentId === folder.id) && !course.pages.some((p) => p.folderId === folder.id);

  const zone = dropZone(
    dropKey,
    (d) => d.kind === "page" || !subtreeIds(course.folders, d.id).has(folder.id),
    (d) => (d.kind === "page" ? movePage(d.id, course.id, folder.id) : moveFolder(d.id, course.id, folder.id)),
  );

  return (
    <div className={`folder${isDropTarget ? " is-drop-target" : ""}`} {...(filtered ? {} : zone)}>
      <div className="row page-row">
        {renaming ? (
          <InlineInput
            label="Rename folder"
            placeholder="Folder name"
            initial={folder.name}
            onSubmit={(name) => {
              setRenaming(false);
              renameFolder(folder.id, name);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className="page-item folder-label"
            aria-expanded={open}
            draggable={!filtered}
            onClick={() => !filtered && toggleFolder(folder.id)}
            onDoubleClick={() => !filtered && setRenaming(true)}
            onDragStart={(e) => startDrag(e, { kind: "folder", id: folder.id })}
            onDragEnd={endDrag}
            title="Double-click to rename · drag to move"
          >
            <Chevron size={13} strokeWidth={2.2} className="folder-chevron" aria-hidden="true" />
            <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{folder.name}</span>
          </button>
        )}
        {!filtered && !renaming && (
          <div className="row-actions" data-open={menuOpen || undefined}>
            <button
              type="button"
              className="row-action"
              aria-label={`Add page to ${folder.name}`}
              title="Add page"
              onClick={() => addPage(course.id, folder.id)}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
            <button
              ref={menuButton}
              type="button"
              className="row-action"
              aria-label={`More actions for folder ${folder.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        {menuOpen && (
          <FolderMenu
            folder={folder}
            course={course}
            anchor={menuButton}
            onClose={closeMenu}
            onRename={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
            onNewFolder={() => {
              setMenuOpen(false);
              if (folder.collapsed) toggleFolder(folder.id);
              setCreating(true);
            }}
          />
        )}
      </div>

      {open && (
        <div className="folder-body">
          {creating && (
            <InlineInput
              label="Folder name"
              placeholder="Folder name"
              onSubmit={(name) => {
                setCreating(false);
                addFolder(course.id, folder.id, name);
              }}
              onCancel={() => setCreating(false)}
            />
          )}
          <TreeLevel course={course} parentId={folder.id} filtered={filtered} />
          {isEmpty && !creating && !filtered && (
            <button type="button" className="tree-add tree-add--muted" onClick={() => addPage(course.id, folder.id)}>
              <Plus size={15} aria-hidden="true" />
              <span>Add page</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface MenuProps {
  folder: Folder;
  course: CourseNode;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onRename(): void;
  onNewFolder(): void;
}

function FolderMenu({ folder, course, anchor, onClose, onRename, onNewFolder }: MenuProps) {
  const tree = useStore((s) => s.tree);
  const { addPage, moveFolder, deleteFolder } = useStore.getState();
  const [view, setView] = useState<"main" | "move">("main");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pageCount = countPages(course, folder.id);

  return (
    <Popover key={view} anchor={anchor} onClose={onClose} label="Folder actions" width={view === "move" ? 280 : 240}>
      {view === "main" ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              onClose();
              addPage(course.id, folder.id);
            }}
          >
            <FilePlus size={15} aria-hidden="true" />
            New page
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={onNewFolder}>
            <FolderPlus size={15} aria-hidden="true" />
            New folder inside
          </button>
          <div className="menu-divider" role="separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={onRename}>
            <Pencil size={15} aria-hidden="true" />
            Rename
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => setView("move")}>
            <FolderInput size={15} aria-hidden="true" />
            Move to…
          </button>
          <div className="menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`menu-item menu-item--danger${confirmDelete ? " is-armed" : ""}`}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onClose();
              deleteFolder(folder.id);
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            {confirmDelete
              ? pageCount
                ? `Delete it and ${pageCount} ${pageCount === 1 ? "page" : "pages"}?`
                : "Click again to delete"
              : "Delete folder"}
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
            Move “{folder.name}” to…
          </button>
          <div className="menu-divider" role="separator" />
          <Destinations
            tree={tree}
            current={{ courseId: course.id, folderId: folder.parentId }}
            exclude={subtreeIds(course.folders, folder.id)}
            onPick={(courseId, parentId) => {
              onClose();
              moveFolder(folder.id, courseId, parentId);
            }}
          />
        </>
      )}
    </Popover>
  );
}

/** Pages in a folder and all its sub-folders. */
function countPages(course: CourseNode, folderId: string): number {
  const ids = subtreeIds(course.folders, folderId);
  return course.pages.filter((p) => p.folderId && ids.has(p.folderId)).length;
}
