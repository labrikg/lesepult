import { useState } from "react";
import { GraduationCap, Pencil, Plus, Trash2, CalendarClock, CalendarDays, Clock, X } from "lucide-react";
import * as study from "../lib/studyRepo";
import type { DeadlineInput, DeadlineKind, DeadlineWithCourse } from "../lib/studyRepo";
import { countdown, daysBetween, formatDate, todayISO } from "./dates";
import { change } from "./useStudy";

const KINDS: { kind: DeadlineKind; label: string }[] = [
  { kind: "exam", label: "Exam" },
  { kind: "deadline", label: "Deadline" },
  { kind: "other", label: "Other" },
];

const KindIcon = ({ kind }: { kind: DeadlineKind }) =>
  kind === "exam" ? (
    <GraduationCap size={15} aria-hidden="true" />
  ) : kind === "deadline" ? (
    <CalendarClock size={15} aria-hidden="true" />
  ) : (
    <CalendarDays size={15} aria-hidden="true" />
  );

interface Props {
  deadlines: DeadlineWithCourse[];
  /** Course new dates go to (none: no add button). */
  courseId?: string;
  showCourse?: boolean;
  emptyText: string;
}

export function DeadlineList({ deadlines, courseId, showCourse, emptyText }: Props) {
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  return (
    <div className="deadline-list">
      {deadlines.length === 0 && !adding && <p className="panel-empty">{emptyText}</p>}
      {deadlines.map((d) => (
        <DeadlineRow key={d.id} d={d} today={today} showCourse={showCourse} />
      ))}
      {courseId &&
        (adding ? (
          <DeadlineForm
            onCancel={() => setAdding(false)}
            onSave={(input) => {
              setAdding(false);
              change((db) => study.createDeadline(db, courseId, input));
            }}
          />
        ) : (
          <button type="button" className="tree-add tree-add--muted" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden="true" />
            <span>Add exam or deadline</span>
          </button>
        ))}
    </div>
  );
}

function DeadlineRow({ d, today, showCourse }: { d: DeadlineWithCourse; today: string; showCourse?: boolean }) {
  const [editing, setEditing] = useState(false);
  const days = daysBetween(today, d.date);
  const past = days < 0;
  const tone = d.done || past ? "" : days <= 3 ? " is-overdue" : days <= 14 ? " is-soon" : "";

  if (editing)
    return (
      <DeadlineForm
        initial={d}
        onCancel={() => setEditing(false)}
        onSave={(input) => {
          setEditing(false);
          change((db) => study.updateDeadline(db, d.id, input));
        }}
      />
    );

  return (
    <div className={`deadline deadline--${d.kind}${d.done || past ? " is-done" : ""}`}>
      <span className="deadline-icon">
        <KindIcon kind={d.kind} />
      </span>
      <div className="deadline-main">
        <span className="deadline-title">{d.title}</span>
        <span className="deadline-when">
          {formatDate(d.date, today)}
          {d.time && ` · ${d.time}`}
        </span>
        {showCourse && (
          <span className="item-course">
            <span className="course-dot" style={{ background: d.courseColor }} aria-hidden="true" />
            {d.courseName}
          </span>
        )}
      </div>
      {d.kind !== "exam" && !past && (
        <label className="deadline-done" title={d.done ? "Done (click to undo)" : "Mark as done (handed in, finished)"}>
          <input
            type="checkbox"
            className="todo-check"
            checked={d.done}
            aria-label={d.done ? `Mark “${d.title}” as not done` : `Mark “${d.title}” as done`}
            // The value is read now: by the time the change runs, React has reset the controlled box.
            onChange={() => {
              const done = !d.done;
              change((db) => study.updateDeadline(db, d.id, { done }));
            }}
          />
        </label>
      )}
      <span className={`countdown-chip${tone}`}>{d.done ? "done" : countdown(d.date, today)}</span>
      <div className="deadline-actions">
        <button type="button" className="row-action" aria-label={`Edit “${d.title}”`} title="Edit" onClick={() => setEditing(true)}>
          <Pencil size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="row-action"
          aria-label={`Delete “${d.title}”`}
          title="Delete"
          onClick={() => change((db) => study.deleteDeadline(db, d.id))}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function DeadlineForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: DeadlineInput;
  onSave(input: DeadlineInput): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<DeadlineKind>(initial?.kind ?? "exam");
  // A new date starts on today, so the date shown is the date saved (an empty date field shows
  // today's date greyed out on macOS, which looked filled in but wasn't).
  const [date, setDate] = useState(initial?.date ?? todayISO());
  // The time is optional and only exists once added: an empty time field shows a made-up time.
  const [time, setTime] = useState<string | null>(initial?.time ?? null);
  const valid = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <form
      className="deadline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ title, kind, date, time: time || null });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="segmented segmented--sm" role="radiogroup" aria-label="Kind">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <input
        className="field"
        autoFocus
        aria-label="Title"
        placeholder={kind === "exam" ? "e.g. Klausur" : kind === "deadline" ? "e.g. Übungsblatt 3" : "e.g. Tutorium"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="deadline-form-row">
        <input className="field" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        {time === null ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTime(kind === "exam" ? "10:00" : "23:59")}>
            <Clock size={14} aria-hidden="true" />
            Add time
          </button>
        ) : (
          <span className="deadline-time">
            <input
              className="field"
              type="time"
              aria-label="Time"
              autoFocus={!initial?.time}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <button type="button" className="row-action" aria-label="Remove time" title="No time" onClick={() => setTime(null)}>
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        )}
        <span className="toolbar-spacer" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary btn--sm" disabled={!valid}>
          Save
        </button>
      </div>
    </form>
  );
}
