import { useCallback, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  Download,
  Hash,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useStore } from "../store";
import type { CourseNode, SemesterNode, TagInfo } from "../lib/repo";
import { InlineInput } from "./InlineInput";
import { ConfirmDelete } from "./ConfirmDelete";
import { PAGE_DRAG_TYPE, PageItem } from "./PageItem";
import { exportLibrary } from "../export/exporter";
import { SettingsMenu } from "./SettingsMenu";
import { TagChip, TagMenu } from "./Tags";

const isMac = navigator.userAgent.includes("Mac");

export function Sidebar() {
  const fullTree = useStore((s) => s.tree);
  const tagFilter = useStore((s) => s.tagFilter);
  const tags = useStore((s) => s.tags);
  const filterTag = tagFilter ? tags.find((t) => t.id === tagFilter.tagId) : undefined;
  // With a tag filter on, only semesters and courses holding tagged pages show, fully expanded.
  const tree = useMemo(() => {
    if (!tagFilter) return fullTree;
    return fullTree
      .map((s) => ({
        ...s,
        collapsed: false,
        courses: s.courses
          .map((c) => ({ ...c, collapsed: false, pages: c.pages.filter((p) => tagFilter.pageIds.has(p.id)) }))
          .filter((c) => c.pages.length > 0),
      }))
      .filter((s) => s.courses.length > 0);
  }, [fullTree, tagFilter]);
  const addSemester = useStore((s) => s.addSemester);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <nav className="sidebar" aria-label="Library">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BookMarked size={18} strokeWidth={1.8} />
        </span>
        <span className="brand-name">Lesepult</span>
      </div>

      <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}>
        <Search size={16} aria-hidden="true" />
        <span>Search notes</span>
        <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <div className="tree">
        {filterTag && (
          <div className="tag-filter" role="status">
            <span>Pages tagged</span>
            <TagChip tag={filterTag} />
            <button
              type="button"
              className="row-action tag-filter-clear"
              aria-label="Show all pages"
              title="Show all pages"
              onClick={() => useStore.getState().setTagFilter(null)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {tree.map((s) => (
          <SemesterSection key={s.id} semester={s} filtered={!!tagFilter} />
        ))}

        {tagFilter ? null : adding ? (
          <InlineInput
            label="Semester name"
            placeholder="e.g. Winter 26/27"
            onSubmit={(name) => {
              setAdding(false);
              addSemester(name);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="tree-add" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden="true" />
            <span>Add semester</span>
          </button>
        )}

        {tags.length > 0 && <TagsSection tags={tags} />}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="footer-item"
          onClick={exportLibrary}
          title="All notes, PDFs and snips as Markdown files in a folder you choose"
        >
          <Download size={16} aria-hidden="true" />
          <span>Export everything…</span>
        </button>
        <button
          ref={settingsButton}
          type="button"
          className="footer-item"
          aria-haspopup="menu"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <Settings size={16} aria-hidden="true" />
          <span>Settings</span>
        </button>
        {settingsOpen && <SettingsMenu anchor={settingsButton} onClose={closeSettings} />}
      </div>
    </nav>
  );
}

function SemesterSection({ semester, filtered }: { semester: SemesterNode; filtered: boolean }) {
  const { toggleSemester, renameSemester, deleteSemester, addCourse } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const Chevron = semester.collapsed ? ChevronRight : ChevronDown;

  return (
    <section className="semester" aria-label={semester.name}>
      <div className="row semester-row">
        {renaming ? (
          <InlineInput
            label="Rename semester"
            placeholder="Semester name"
            initial={semester.name}
            onSubmit={(name) => {
              setRenaming(false);
              renameSemester(semester.id, name);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className="row-main semester-label"
            aria-expanded={!semester.collapsed}
            onClick={() => !filtered && toggleSemester(semester.id)}
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            <Chevron size={13} strokeWidth={2.2} aria-hidden="true" />
            <span className="truncate">{semester.name}</span>
            {semester.collapsed && semester.courses.length > 0 && (
              <span className="row-meta">
                {semester.courses.length} {semester.courses.length === 1 ? "course" : "courses"}
              </span>
            )}
          </button>
        )}
        {!filtered && (
          <div className="row-actions">
            <button
              type="button"
              className="row-action"
              aria-label={`Add course to ${semester.name}`}
              title="Add course"
              onClick={() => setAddingCourse(true)}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
            <ConfirmDelete what={semester.name} onConfirm={() => deleteSemester(semester.id)} />
          </div>
        )}
      </div>

      {!semester.collapsed && (
        <div className="semester-body">
          {semester.courses.map((c) => (
            <CourseItem key={c.id} course={c} filtered={filtered} />
          ))}
          {addingCourse && (
            <InlineInput
              label="Course name"
              placeholder="Course name"
              onSubmit={(name) => {
                setAddingCourse(false);
                addCourse(semester.id, name);
              }}
              onCancel={() => setAddingCourse(false)}
            />
          )}
          {semester.courses.length === 0 && !addingCourse && !filtered && (
            <button type="button" className="tree-add tree-add--muted" onClick={() => setAddingCourse(true)}>
              <Plus size={15} aria-hidden="true" />
              <span>Add course</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function CourseItem({ course, filtered }: { course: CourseNode; filtered: boolean }) {
  const { toggleCourse, renameCourse, deleteCourse, addPage, movePage } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const Chevron = course.collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className={`course${dropTarget ? " course--drop" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(false);
      }}
      onDrop={(e) => {
        setDropTarget(false);
        const pageId = e.dataTransfer.getData(PAGE_DRAG_TYPE);
        if (!pageId) return;
        e.preventDefault();
        movePage(pageId, course.id);
      }}
    >
      <div className="row">
        {renaming ? (
          <InlineInput
            label="Rename course"
            placeholder="Course name"
            initial={course.name}
            onSubmit={(name) => {
              setRenaming(false);
              renameCourse(course.id, name);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className="row-main course-label"
            aria-expanded={!course.collapsed}
            onClick={() => !filtered && toggleCourse(course.id)}
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            <Chevron size={14} strokeWidth={2} aria-hidden="true" />
            <span className="course-dot" style={{ background: course.color }} aria-hidden="true" />
            <span className="truncate">{course.name}</span>
          </button>
        )}
        {!filtered && (
          <div className="row-actions">
            <button
              type="button"
              className="row-action"
              aria-label={`Add page to ${course.name}`}
              title="Add page"
              onClick={() => addPage(course.id)}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
            <ConfirmDelete what={course.name} onConfirm={() => deleteCourse(course.id)} />
          </div>
        )}
      </div>

      {!course.collapsed && (
        <div className="course-body">
          {course.pages.map((p) => (
            <PageItem key={p.id} page={p} />
          ))}
          {!filtered && (
            <button type="button" className="tree-add tree-add--muted" onClick={() => addPage(course.id)}>
              <Plus size={15} aria-hidden="true" />
              <span>Add page</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const TAGS_COLLAPSED_KEY = "lesepult.tagsCollapsed";

function TagsSection({ tags }: { tags: TagInfo[] }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(TAGS_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(TAGS_COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // only a convenience
      }
      return !c;
    });
  };
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section className="semester tags-section" aria-label="Tags">
      <div className="row semester-row">
        <button type="button" className="row-main semester-label" aria-expanded={!collapsed} onClick={toggle}>
          <Chevron size={13} strokeWidth={2.2} aria-hidden="true" />
          <span className="truncate">Tags</span>
          {collapsed && <span className="row-meta">{tags.length}</span>}
        </button>
      </div>
      {!collapsed && (
        <div className="semester-body">
          {tags.map((t) => (
            <SidebarTag key={t.id} tag={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function SidebarTag({ tag }: { tag: TagInfo }) {
  const active = useStore((s) => s.tagFilter?.tagId === tag.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <div className="row page-row">
      <button
        type="button"
        className="page-item tag-item"
        data-color={tag.color}
        aria-pressed={active}
        onClick={() => useStore.getState().setTagFilter(active ? null : tag.id)}
        title={active ? "Show all pages" : `Show pages tagged “${tag.name}”`}
      >
        <Hash size={14} strokeWidth={2.2} className="tag-item-icon" aria-hidden="true" />
        <span className="truncate">{tag.name}</span>
        <span className="row-meta">{tag.count}</span>
      </button>
      <div className="row-actions" data-open={menuOpen || undefined}>
        <button
          ref={menuButton}
          type="button"
          className="row-action"
          aria-label={`More actions for tag ${tag.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </div>
      {menuOpen && <TagMenu tag={tag} anchor={menuButton} onClose={closeMenu} />}
    </div>
  );
}
