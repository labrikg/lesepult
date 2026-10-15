import { Layers, Play } from "lucide-react";
import * as study from "../lib/studyRepo";
import { useStore } from "../store";
import { DeadlineList } from "./DeadlineList";
import { TodoList } from "./TodoList";
import { addDays, formatLongDate, todayISO } from "./dates";
import { Stat } from "./CourseView";
import { useStudy } from "./useStudy";
import { FocusPanel } from "./FocusPanel";

/** What's on today: cards to review, dates coming up, open to-dos, across all courses. */
export function TodayView() {
  const tree = useStore((s) => s.tree);
  const startReview = useStore((s) => s.startReview);
  const openCourse = useStore((s) => s.openCourse);
  const today = todayISO();
  const courses = tree.flatMap((s) => s.courses);

  const data = useStudy(
    async (db) => {
      const [counts, deadlines, todos] = await Promise.all([
        study.cardCounts(db, new Date().toISOString()),
        study.listDeadlines(db, { from: today }),
        study.listTodos(db, { openOnly: true }),
      ]);
      return { counts, deadlines, todos };
    },
    [today],
  );

  const counts = data?.counts ?? [];
  const due = counts.reduce((n, c) => n + c.due, 0);
  const totalCards = counts.reduce((n, c) => n + c.total, 0);
  const soon = (data?.deadlines ?? []).filter(
    (d) => !d.done && d.date <= addDays(today, 60),
  );
  const courseOf = (id: string) => courses.find((c) => c.id === id);

  return (
    <section className="study" aria-label="Today">
      <header className="study-head">
        <span className="study-eyebrow">Today</span>
        <h1 className="study-title">{formatLongDate(today)}</h1>
      </header>

      <div className="study-grid">
        <section className="panel panel--wide" aria-labelledby="review-title">
          <div className="panel-head">
            <h2 id="review-title">
              <Layers size={16} aria-hidden="true" />
              Review
            </h2>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={due === 0}
              onClick={() => startReview(null)}
            >
              <Play size={13} aria-hidden="true" />
              {due ? `Review all ${due}` : "Nothing due"}
            </button>
          </div>
          {totalCards === 0 ? (
            <p className="panel-empty">
              No flashcards yet. Type <kbd>/card</kbd> in a note, or select text
              in a PDF and choose “Flashcard”.
            </p>
          ) : (
            <div className="review-courses">
              {counts
                .filter((c) => courseOf(c.courseId))
                .sort((a, b) => b.due - a.due)
                .map((c) => {
                  const course = courseOf(c.courseId)!;
                  return (
                    <div key={c.courseId} className="review-course-row">
                      <button
                        type="button"
                        className="review-course-name"
                        onClick={() => openCourse(c.courseId)}
                      >
                        <span
                          className="course-dot"
                          style={{ background: course.color }}
                          aria-hidden="true"
                        />
                        {course.name}
                      </button>
                      <Stat value={c.due} label="due" />
                      <Stat value={c.fresh} label="new" />
                      <Stat value={c.total} label="cards" />
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={c.due === 0}
                        onClick={() => startReview(c.courseId)}
                      >
                        Review
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* Two independent columns, so a tall to-do list doesn't push Focus down under Coming up. */}
        <div className="study-columns">
          <div className="study-column">
            <section className="panel" aria-labelledby="soon-title">
              <div className="panel-head">
                <h2 id="soon-title">Coming up</h2>
                <span className="panel-meta">next 60 days</span>
              </div>
              <DeadlineList
                deadlines={soon}
                showCourse
                emptyText="No exams or deadlines in the next two months. Add them in a course’s overview."
              />
            </section>

            <FocusPanel />
          </div>
          <div className="study-column">
            <section className="panel" aria-labelledby="todo-title">
              <div className="panel-head">
                <h2 id="todo-title">To-dos</h2>
                {data && data.todos.length > 0 && (
                  <span className="panel-meta">{data.todos.length} open</span>
                )}
              </div>
              <TodoList
                todos={data?.todos ?? []}
                courses={courses.map((c) => ({ id: c.id, name: c.name }))}
                showCourse
                emptyText={
                  courses.length ? "Nothing open." : "Add a course first."
                }
              />
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
