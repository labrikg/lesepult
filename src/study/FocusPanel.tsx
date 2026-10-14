import { Play, Timer as TimerIcon } from "lucide-react";
import * as study from "../lib/studyRepo";
import { useStore } from "../store";
import { formatMinutes } from "./pomodoro";
import { useTimer } from "./timerStore";
import { dayStart, weekStart } from "./dates";
import { Stat } from "./CourseView";
import { useStudy } from "./useStudy";

/** Focus time from the Pomodoro timer: today, this week, and this week per course. */
export function FocusPanel() {
  const tree = useStore((s) => s.tree);
  const running = useTimer((s) => s.state.running);
  const data = useStudy(async (db) => {
    const [today, week] = await Promise.all([study.focusStats(db, dayStart()), study.focusStats(db, weekStart())]);
    return { today, week };
  }, []);
  const courses = tree.flatMap((s) => s.courses);
  const perCourse = data
    ? [...data.week.byCourse.entries()]
        .map(([id, minutes]) => ({ id, minutes, course: courses.find((c) => c.id === id) }))
        .sort((a, b) => b.minutes - a.minutes)
    : [];
  const max = Math.max(1, ...perCourse.map((c) => c.minutes));

  return (
    <section className="panel" aria-labelledby="focus-title">
      <div className="panel-head">
        <h2 id="focus-title">
          <TimerIcon size={16} aria-hidden="true" />
          Focus
        </h2>
        {!running && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => useTimer.getState().start()}>
            <Play size={13} aria-hidden="true" />
            Start focus
          </button>
        )}
      </div>
      <div className="stat-row">
        <Stat value={Math.round(data?.today.minutes ?? 0)} label="min today" />
        <Stat value={data?.today.rounds ?? 0} label="rounds today" />
        <Stat value={Math.round(data?.week.minutes ?? 0)} label="min this week" />
      </div>
      {perCourse.length === 0 ? (
        <p className="panel-empty">No focus time this week yet. The timer is in the top bar.</p>
      ) : (
        <ul className="focus-bars">
          {perCourse.map((c) => (
            <li key={c.id || "none"}>
              <span className="focus-bar-name">{c.course?.name ?? "No course"}</span>
              <span className="focus-bar-track">
                <span
                  className="focus-bar-fill"
                  style={{ width: `${(c.minutes / max) * 100}%`, background: c.course?.color ?? "var(--faint)" }}
                />
              </span>
              <span className="focus-bar-value">{formatMinutes(c.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
