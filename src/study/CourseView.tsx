import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Layers,
  Play,
  Timer as TimerIcon,
} from "lucide-react";
import * as study from "../lib/studyRepo";
import { useStore } from "../store";
import { CardList } from "./CardList";
import { DeadlineList } from "./DeadlineList";
import { TodoList } from "./TodoList";
import { countdown, formatDate, todayISO, weekStart } from "./dates";
import { formatMinutes } from "./pomodoro";
import { useStudy } from "./useStudy";

/** A course at a glance: next exam, flashcards, dates and to-dos. */
export function CourseView({ courseId }: { courseId: string }) {
  const tree = useStore((s) => s.tree);
  const startReview = useStore((s) => s.startReview);
  const [showCards, setShowCards] = useState(false);
  const semester = tree.find((s) => s.courses.some((c) => c.id === courseId));
  const course = semester?.courses.find((c) => c.id === courseId);

  const data = useStudy(
    async (db) => {
      const now = new Date().toISOString();
      const [cards, counts, deadlines, todos, focus] = await Promise.all([
        study.listCards(db, courseId),
        study.cardCounts(db, now),
        study.listDeadlines(db, { courseId }),
        study.listTodos(db, { courseId }),
        study.focusStats(db, weekStart()),
      ]);
      return {
        cards,
        counts: counts.find((c) => c.courseId === courseId),
        deadlines,
        todos,
        focusWeek: focus.byCourse.get(courseId) ?? 0,
      };
    },
    [courseId],
  );

  if (!course || !semester) return null;
  const today = todayISO();
  const nextExam = data?.deadlines.find(
    (d) => d.kind === "exam" && d.date >= today,
  );
  const upcoming = data?.deadlines.filter((d) => d.date >= today) ?? [];
  const past = data?.deadlines.filter((d) => d.date < today) ?? [];
  const counts = data?.counts ?? { total: 0, fresh: 0, due: 0, mature: 0 };
  const done = data?.todos.filter((t) => t.done).length ?? 0;
  const total = data?.todos.length ?? 0;

  return (
    <section className="study" aria-label={`${course.name} overview`}>
      <header className="study-head">
        <span className="study-eyebrow">{semester.name}</span>
        <h1 className="study-title">
          <span
            className="course-dot course-dot--lg"
            style={{ background: course.color }}
            aria-hidden="true"
          />
          {course.name}
        </h1>
        <div className="study-facts">
          {nextExam && (
            <div className="exam-hero">
              <GraduationCap size={18} aria-hidden="true" />
              <span>
                <strong>{nextExam.title}</strong> ·{" "}
                {formatDate(nextExam.date, today)}
                {nextExam.time && `, ${nextExam.time}`}
              </span>
              <span className="exam-hero-count">
                {countdown(nextExam.date, today)}
              </span>
            </div>
          )}
          {data && data.focusWeek > 0 && (
            <div
              className="focus-chip"
              title="Focus time from the Pomodoro timer, since Monday"
            >
              <TimerIcon size={15} aria-hidden="true" />
              {formatMinutes(data.focusWeek)} focused this week
            </div>
          )}
        </div>
      </header>

      <div className="study-grid">
        <section className="panel panel--wide" aria-labelledby="cards-title">
          <div className="panel-head">
            <h2 id="cards-title">
              <Layers size={16} aria-hidden="true" />
              Flashcards
            </h2>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={counts.due === 0}
              onClick={() => startReview(courseId)}
            >
              <Play size={13} aria-hidden="true" />
              {counts.due ? `Review ${counts.due}` : "Nothing due"}
            </button>
          </div>
          <div className="stat-row">
            <Stat value={counts.due} label="due now" />
            <Stat value={counts.fresh} label="new" />
            <Stat
              value={counts.mature}
              label="learned"
              hint="Remembered for 3 weeks or more"
            />
            <Stat value={counts.total} label="in total" />
          </div>
          {counts.total === 0 ? (
            <p className="panel-empty">
              No cards yet. Type <kbd>/card</kbd> in a note, or click a
              highlight in a PDF and choose “Flashcard”.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="tree-add tree-add--muted"
                aria-expanded={showCards}
                onClick={() => setShowCards((s) => !s)}
              >
                {showCards ? (
                  <ChevronDown size={15} aria-hidden="true" />
                ) : (
                  <ChevronRight size={15} aria-hidden="true" />
                )}
                <span>
                  {showCards ? "Hide cards" : `Show all ${counts.total} cards`}
                </span>
              </button>
              {showCards && data && <CardList cards={data.cards} />}
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="dates-title">
          <div className="panel-head">
            <h2 id="dates-title">Exams &amp; deadlines</h2>
          </div>
          <DeadlineList
            deadlines={upcoming}
            courseId={courseId}
            emptyText="Nothing coming up."
          />
          {past.length > 0 && (
            <details className="past-dates">
              <summary>{past.length} past</summary>
              <DeadlineList deadlines={past} emptyText="" />
            </details>
          )}
        </section>

        <section className="panel" aria-labelledby="todos-title">
          <div className="panel-head">
            <h2 id="todos-title">To-dos</h2>
            {total > 0 && (
              <span className="panel-meta">
                {done} of {total} done
              </span>
            )}
          </div>
          {total > 0 && (
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <div
                style={{
                  width: `${(done / total) * 100}%`,
                  background: course.color,
                }}
              />
            </div>
          )}
          <TodoList
            todos={data?.todos ?? []}
            courseId={courseId}
            emptyText="No to-dos yet."
          />
        </section>
      </div>
    </section>
  );
}

export function Stat({
  value,
  label,
  hint,
}: {
  value: number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="stat" title={hint}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
