import { useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import * as study from "../lib/studyRepo";
import type { Todo } from "../lib/studyRepo";
import { InlineInput } from "../components/InlineInput";
import { countdown, daysBetween, formatDate, todayISO } from "./dates";
import { change } from "./useStudy";

interface Props {
  todos: Todo[];
  /** Course new to-dos go to; with `courses`, the person picks one. */
  courseId?: string;
  courses?: { id: string; name: string }[];
  /** Show which course each to-do belongs to (Today). */
  showCourse?: boolean;
  emptyText: string;
}

export function TodoList({ todos, courseId, courses, showCourse, emptyText }: Props) {
  const today = todayISO();
  return (
    <div className="todo-list">
      {todos.length === 0 && <p className="panel-empty">{emptyText}</p>}
      {todos.map((t) => (
        <TodoRow key={t.id} todo={t} today={today} showCourse={showCourse} />
      ))}
      {(courseId || (courses && courses.length > 0)) && <AddTodo courseId={courseId} courses={courses} />}
    </div>
  );
}

function TodoRow({ todo, today, showCourse }: { todo: Todo; today: string; showCourse?: boolean }) {
  const [editing, setEditing] = useState(false);
  const days = todo.dueDate ? daysBetween(today, todo.dueDate) : null;
  const tone = todo.done || days === null ? "" : days < 0 ? " is-overdue" : days <= 1 ? " is-soon" : "";

  return (
    <div className={`todo${todo.done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={todo.done}
        aria-label={todo.done ? `Mark “${todo.title}” as not done` : `Mark “${todo.title}” as done`}
        onChange={(e) => change((db) => study.updateTodo(db, todo.id, { done: e.target.checked }))}
      />
      {editing ? (
        <InlineInput
          label="Edit to-do"
          placeholder="To-do"
          initial={todo.title}
          onSubmit={(title) => {
            setEditing(false);
            change((db) => study.updateTodo(db, todo.id, { title }));
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span className="todo-main">
          <span className="todo-title" onDoubleClick={() => setEditing(true)} title="Double-click to edit">
            {todo.title}
          </span>
          {showCourse && (
            <span className="item-course">
              <span className="course-dot" style={{ background: todo.courseColor }} aria-hidden="true" />
              {todo.courseName}
            </span>
          )}
        </span>
      )}
      <label className={`date-chip${tone}${todo.dueDate ? "" : " is-unset"}`} title="Due date">
        <CalendarDays size={12} aria-hidden="true" />
        <span>{todo.dueDate ? (days !== null && Math.abs(days) <= 1 ? countdown(todo.dueDate, today) : formatDate(todo.dueDate, today)) : "Date"}</span>
        <input
          type="date"
          className="date-chip-input"
          aria-label="Due date"
          value={todo.dueDate ?? ""}
          onChange={(e) => change((db) => study.updateTodo(db, todo.id, { dueDate: e.target.value || null }))}
        />
      </label>
      <button
        type="button"
        className="row-action todo-delete"
        aria-label={`Delete “${todo.title}”`}
        title="Delete"
        onClick={() => change((db) => study.deleteTodo(db, todo.id))}
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function AddTodo({ courseId, courses }: { courseId?: string; courses?: { id: string; name: string }[] }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [target, setTarget] = useState(courseId ?? courses?.[0]?.id ?? "");

  const add = () => {
    if (!title.trim() || !target) return;
    const t = title;
    setTitle("");
    setDue("");
    change((db) => study.createTodo(db, target, t, due || null));
  };

  return (
    <form
      className="todo-add"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        className="todo-add-input"
        aria-label="New to-do"
        placeholder="Add a to-do…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {!courseId && courses && (
        <select className="todo-add-course" aria-label="Course" value={target} onChange={(e) => setTarget(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <input
        type="date"
        className="todo-add-date"
        aria-label="Due date (optional)"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <button type="submit" className="btn btn--ghost btn--sm" disabled={!title.trim()}>
        Add
      </button>
    </form>
  );
}
