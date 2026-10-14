import { useState } from "react";
import { BookMarked, ChevronDown, ChevronRight, Download, Plus, Search, Settings } from "lucide-react";
import { useStore } from "../store";
import type { CourseNode, SemesterNode } from "../lib/repo";
import { InlineInput } from "./InlineInput";
import { ConfirmDelete } from "./ConfirmDelete";
import { PAGE_DRAG_TYPE, PageItem } from "./PageItem";
import { exportLibrary } from "../export/exporter";

const isMac = navigator.userAgent.includes("Mac");

export function Sidebar() {
  const tree = useStore((s) => s.tree);
  const addSemester = useStore((s) => s.addSemester);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const [adding, setAdding] = useState(false);

  return (
    <nav className="sidebar" aria-label="Library">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BookMarked size={18} strokeWidth={1.8} />
        </span>
        <span className="brand-name">Study Hub</span>
      </div>

      <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}>
        <Search size={16} aria-hidden="true" />
        <span>Search notes</span>
        <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <div className="tree">
        {tree.map((s) => (
          <SemesterSection key={s.id} semester={s} />
        ))}

        {adding ? (
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
        <button type="button" className="footer-item" disabled title="Coming soon">
          <Settings size={16} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </nav>
  );
}

function SemesterSection({ semester }: { semester: SemesterNode }) {
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
            onClick={() => toggleSemester(semester.id)}
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
      </div>

      {!semester.collapsed && (
        <div className="semester-body">
          {semester.courses.map((c) => (
            <CourseItem key={c.id} course={c} />
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
          {semester.courses.length === 0 && !addingCourse && (
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

function CourseItem({ course }: { course: CourseNode }) {
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
            onClick={() => toggleCourse(course.id)}
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            <Chevron size={14} strokeWidth={2} aria-hidden="true" />
            <span className="course-dot" style={{ background: course.color }} aria-hidden="true" />
            <span className="truncate">{course.name}</span>
          </button>
        )}
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
      </div>

      {!course.collapsed && (
        <div className="course-body">
          {course.pages.map((p) => (
            <PageItem key={p.id} page={p} />
          ))}
          <button type="button" className="tree-add tree-add--muted" onClick={() => addPage(course.id)}>
            <Plus size={15} aria-hidden="true" />
            <span>Add page</span>
          </button>
        </div>
      )}
    </div>
  );
}
