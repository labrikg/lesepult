import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderPlus,
  Hash,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  X,
  ChartColumn,
} from "lucide-react";
import { countdown, daysBetween, todayISO } from "../study/dates";
import { folderPath, useStore } from "../store";
import type { CourseNode, SemesterNode, TagInfo } from "../lib/repo";
import { InlineInput } from "./InlineInput";
import { ConfirmDelete } from "./ConfirmDelete";
import { TreeLevel } from "./FolderItem";
import { dropZone, useDropTarget } from "./dnd";
import { exportLibrary } from "../export/exporter";
import { SettingsMenu } from "./SettingsMenu";
import { BrandMark } from "./BrandMark";
import { TagChip, TagMenu } from "./Tags";
import { shortcut } from "../lib/platform";


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
          .map((c) => {
            const pages = c.pages.filter((p) => tagFilter.pageIds.has(p.id));
            const keep = new Set(pages.flatMap((p) => folderPath(c.folders, p.folderId).map((f) => f.id)));
            const folders = c.folders.filter((f) => keep.has(f.id)).map((f) => ({ ...f, collapsed: false }));
            return { ...c, collapsed: false, pages, folders };
          })
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
        <BrandMark size={32} />
        <span className="brand-name">Lesepult</span>
      </div>

      <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}>
        <Search size={16} aria-hidden="true" />
        <span>Search</span>
        <kbd>{shortcut("K")}</kbd>
      </button>

      <div className="nav-items">
        <TodayButton />
        <StatsButton />
      </div>

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
  const { toggleCourse, renameCourse, deleteCourse, addPage, addFolder, movePage, moveFolder, openCourse } =
    useStore.getState();
  const isOpen = useStore((s) => s.view.kind === "course" && s.view.courseId === course.id);
  const [renaming, setRenaming] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const dropKey = `course:${course.id}`;
  const isDropTarget = useDropTarget((s) => s.over === dropKey);
  const Chevron = course.collapsed ? ChevronRight : ChevronDown;

  // Dropped on the course itself: to its top level.
  const zone = dropZone(
    dropKey,
    () => true,
    (d) => (d.kind === "page" ? movePage(d.id, course.id, null) : moveFolder(d.id, course.id, null)),
  );

  return (
    <div className={`course${isDropTarget ? " course--drop" : ""}`} {...(filtered ? {} : zone)}>
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
          <>
            <button
              type="button"
              className="row-toggle"
              aria-expanded={!course.collapsed}
              aria-label={course.collapsed ? `Show ${course.name}` : `Hide ${course.name}`}
              onClick={() => !filtered && toggleCourse(course.id)}
            >
              <Chevron size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="row-main course-label"
              aria-current={isOpen ? "page" : undefined}
              onClick={() => openCourse(course.id)}
              onDoubleClick={() => setRenaming(true)}
              title="Overview: flashcards, exams, to-dos · double-click to rename"
            >
              <span className="course-dot" style={{ background: course.color }} aria-hidden="true" />
              <span className="truncate">{course.name}</span>
              <ExamChip courseId={course.id} />
            </button>
          </>
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
            <button
              type="button"
              className="row-action"
              aria-label={`New folder in ${course.name}`}
              title="New folder"
              onClick={() => {
                if (course.collapsed) toggleCourse(course.id);
                setCreatingFolder(true);
              }}
            >
              <FolderPlus size={14} aria-hidden="true" />
            </button>
            <ConfirmDelete what={course.name} onConfirm={() => deleteCourse(course.id)} />
          </div>
        )}
      </div>

      {!course.collapsed && (
        <div className="course-body">
          {creatingFolder && (
            <InlineInput
              label="Folder name"
              placeholder="Folder name, e.g. Vorlesungen"
              onSubmit={(name) => {
                setCreatingFolder(false);
                addFolder(course.id, null, name);
              }}
              onCancel={() => setCreatingFolder(false)}
            />
          )}
          <TreeLevel course={course} parentId={null} filtered={filtered} />
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

function TodayButton() {
  const active = useStore((s) => s.view.kind === "today");
  const due = useStore((s) => s.studyMeta.dueCards);
  return (
    <button
      type="button"
      className="today-item"
      aria-current={active ? "page" : undefined}
      onClick={() => useStore.getState().openToday()}
    >
      <Sun size={16} aria-hidden="true" />
      <span>Today</span>
      {due > 0 && (
        <span className="today-badge" title={`${due} ${due === 1 ? "card" : "cards"} to review`}>
          {due}
        </span>
      )}
    </button>
  );
}

function StatsButton() {
  const active = useStore((s) => s.view.kind === "stats");
  return (
    <button
      type="button"
      className="today-item"
      aria-current={active ? "page" : undefined}
      onClick={() => useStore.getState().openStats()}
    >
      <ChartColumn size={16} aria-hidden="true" />
      <span>Statistics</span>
    </button>
  );
}

/** "Exam in 12 d" next to a course whose exam is within 30 days. */
function ExamChip({ courseId }: { courseId: string }) {
  const exam = useStore((s) => s.studyMeta.nextExam[courseId]);
  if (!exam) return null;
  const days = daysBetween(todayISO(), exam.date);
  if (days > 30) return null;
  return (
    <span className={`exam-chip${days <= 7 ? " is-close" : ""}`} title={`${exam.title}: ${countdown(exam.date)}`}>
      {days === 0 ? "today" : `${days} d`}
    </span>
  );
}
