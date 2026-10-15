import { useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Flame,
  GraduationCap,
  Table2,
  Timer as TimerIcon,
  TrendingUp,
  Zap,
} from "lucide-react";
import * as study from "../lib/studyRepo";
import { useStore } from "../store";
import { addDays, countdown, daysBetween, formatDate, todayISO } from "./dates";
import { formatMinutes } from "./pomodoro";
import { recallAt } from "./srs";
import {
  activityLevel,
  dailyActivity,
  examMoment,
  forecast,
  heatmapWeeks,
  retentionByCourse,
  streaks,
  weeklyFocus,
  type DayActivity,
} from "./stats";
import { useStudy } from "./useStudy";

const HEAT_WEEKS = 26;
const FOCUS_WEEKS = 12;
const FORECAST_DAYS = 14;
/** FSRS aims for this share of remembered answers. */
const TARGET_RETENTION = 0.9;
/** Fewer answers than this and a retention figure means little. */
const MIN_ANSWERS = 10;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(y, m - 1, d));
};
const weekdayShort = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(y, m - 1, d),
  );
};
const activityText = (a: DayActivity | undefined) => {
  if (!a || (a.reviews === 0 && a.minutes < 0.5)) return "Nothing";
  const parts = [];
  if (a.reviews)
    parts.push(`${a.reviews} ${a.reviews === 1 ? "card" : "cards"}`);
  if (a.minutes >= 0.5) parts.push(`${formatMinutes(a.minutes)} focus`);
  return parts.join(" · ");
};

/** Study statistics: activity heatmap, what's coming due, focus time, retention, exam readiness. */
export function StatsView() {
  const tree = useStore((s) => s.tree);
  const startReview = useStore((s) => s.startReview);
  const openCourse = useStore((s) => s.openCourse);
  const courses = useMemo(() => tree.flatMap((s) => s.courses), [tree]);
  const [courseId, setCourseId] = useState<string>("");
  const [heatTable, setHeatTable] = useState(false);
  const filter = courseId || null;
  const today = todayISO();

  const data = useStudy(
    async (db) => {
      const since = new Date(
        `${heatmapWeeks(today, HEAT_WEEKS)[0][0]}T00:00:00`,
      ).toISOString();
      const [reviews, focus, cards, deadlines, focusTotals] = await Promise.all(
        [
          study.reviewLog(db, since, filter),
          study.focusLog(db, since, filter),
          study.listCards(db, filter ?? undefined),
          study.listDeadlines(db, {
            from: today,
            courseId: filter ?? undefined,
          }),
          study.focusTotals(db),
        ],
      );
      return { reviews, focus, cards, deadlines, focusTotals };
    },
    [filter, today],
  );

  const days = useMemo(
    () => (data ? dailyActivity(data.reviews, data.focus) : new Map()),
    [data],
  );
  const streak = streaks(days, today);
  const last30 = addDays(today, -29);
  const recent = [...days.entries()].filter(([d]) => d >= last30);
  const activeDays30 = recent.filter(
    ([, a]) => a.reviews > 0 || a.minutes >= 0.5,
  ).length;
  const cards30 = recent.reduce((n, [, a]) => n + a.reviews, 0);
  const minutes30 = recent.reduce((n, [, a]) => n + a.minutes, 0);

  const courseName = (id: string) =>
    courses.find((c) => c.id === id)?.name ?? "Deleted course";
  const courseColor = (id: string) =>
    courses.find((c) => c.id === id)?.color ?? "var(--faint)";

  return (
    <section className="study" aria-label="Statistics">
      <header className="study-head">
        <span className="study-eyebrow">Statistics</span>
        <h1 className="study-title">How your studying goes</h1>
        <div className="stats-filters">
          <label className="stats-filter">
            <span>Show</span>
            <select
              className="todo-add-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className={`study-grid${data ? "" : " is-loading"}`}>
        <section className="panel panel--wide" aria-labelledby="activity-title">
          <PanelHead
            id="activity-title"
            icon={<Flame size={16} aria-hidden="true" />}
            title="Activity"
            meta="last 6 months"
            table={heatTable}
            onTable={() => setHeatTable((t) => !t)}
          />
          <div className="activity">
            <Heatmap days={days} today={today} table={heatTable} />
            <div className="activity-facts">
              <Fact
                value={streak.current}
                unit={streak.current === 1 ? "day" : "days"}
                label="current streak"
              />
              <Fact
                value={streak.longest}
                unit={streak.longest === 1 ? "day" : "days"}
                label="longest streak"
              />
              <Fact value={activeDays30} unit="of 30" label="days studied" />
              <Fact value={cards30} label="cards answered (30 d)" />
              <Fact value={formatMinutes(minutes30)} label="focus (30 d)" />
            </div>
          </div>
        </section>

        <ForecastPanel cards={data?.cards ?? []} today={today} />
        <FocusPanel focus={data?.focus ?? []} today={today} />

        <RetentionPanel
          reviews={(data?.reviews ?? []).filter(
            (r) => localDayOf(r.reviewedAt) >= last30,
          )}
          courseIds={filter ? [filter] : courses.map((c) => c.id)}
          courseName={courseName}
          courseColor={courseColor}
        />

        <section className="panel" aria-labelledby="exam-title">
          <PanelHead
            id="exam-title"
            icon={<GraduationCap size={16} aria-hidden="true" />}
            title="Exam readiness"
          />
          <ExamReadiness
            exams={nextExams(data?.deadlines ?? [])}
            cards={data?.cards ?? []}
            focusTotals={data?.focusTotals ?? new Map()}
            today={today}
            courseColor={courseColor}
            onCram={(id) => startReview(id, true)}
            onOpenCourse={openCourse}
          />
        </section>
      </div>
    </section>
  );
}

const localDayOf = (iso: string) => todayISO(new Date(iso));

/** Each course's next exam that isn't ticked off (the list comes sorted by date). */
function nextExams(deadlines: study.DeadlineWithCourse[]) {
  const seen = new Set<string>();
  return deadlines.filter((d) => {
    if (d.kind !== "exam" || d.done || seen.has(d.courseId)) return false;
    seen.add(d.courseId);
    return true;
  });
}

function PanelHead({
  id,
  icon,
  title,
  meta,
  table,
  onTable,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  meta?: string;
  table?: boolean;
  onTable?: () => void;
}) {
  return (
    <div className="panel-head">
      <h2 id={id}>
        {icon}
        {title}
      </h2>
      {meta && <span className="panel-meta">{meta}</span>}
      {onTable && (
        <button
          type="button"
          className={`row-action stats-table-toggle${meta ? "" : " is-pushed"}`}
          aria-pressed={table}
          aria-label={table ? "Show as chart" : "Show as table"}
          title={table ? "Show as chart" : "Show as table"}
          onClick={onTable}
        >
          <Table2 size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Fact({
  value,
  unit,
  label,
}: {
  value: number | string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="fact">
      <span className="fact-value">
        {value}
        {unit && <span className="fact-unit"> {unit}</span>}
      </span>
      <span className="fact-label">{label}</span>
    </div>
  );
}

/* ---------- Tooltip ---------- */

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (el: Element, value: string, label: string) => {
    const b = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (b)
      setTip({
        x: r.left + r.width / 2 - b.left,
        y: r.top - b.top,
        value,
        label,
      });
  };
  const node = tip && (
    <div
      className="chart-tip"
      style={{ left: tip.x, top: tip.y }}
      role="status"
    >
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  );
  return { box, show, hide: () => setTip(null), node };
}

/* ---------- Heatmap ---------- */

function Heatmap({
  days,
  today,
  table,
}: {
  days: Map<string, DayActivity>;
  today: string;
  table: boolean;
}) {
  const weeks = useMemo(() => heatmapWeeks(today, HEAT_WEEKS), [today]);
  const tip = useTip();

  // A month label above the first week that starts in that month.
  const months = weeks.map((w, i) => {
    const m = w[0].slice(0, 7);
    return i === 0 || m !== weeks[i - 1][0].slice(0, 7)
      ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(
          new Date(`${w[0]}T12:00:00`),
        )
      : "";
  });

  const monthly = useMemo(() => {
    const out = new Map<
      string,
      { reviews: number; minutes: number; days: number }
    >();
    for (const [d, a] of days) {
      if (d < weeks[0][0]) continue;
      const m = d.slice(0, 7);
      const t = out.get(m) ?? { reviews: 0, minutes: 0, days: 0 };
      t.reviews += a.reviews;
      t.minutes += a.minutes;
      if (activityLevel(a) > 0) t.days++;
      out.set(m, t);
    }
    return [...out.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [days, weeks]);

  return (
    <div className="heatmap-wrap">
      {table ? (
        <table className="stats-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Days studied</th>
              <th>Cards</th>
              <th>Focus</th>
            </tr>
          </thead>
          <tbody>
            {monthly.length === 0 && (
              <tr>
                <td colSpan={4}>Nothing yet.</td>
              </tr>
            )}
            {monthly.map(([m, t]) => (
              <tr key={m}>
                <td>
                  {new Intl.DateTimeFormat(undefined, {
                    month: "long",
                    year: "numeric",
                  }).format(new Date(`${m}-15T12:00:00`))}
                </td>
                <td>{t.days}</td>
                <td>{t.reviews}</td>
                <td>{formatMinutes(t.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="heatmap" ref={tip.box} onPointerLeave={tip.hide}>
          <div className="heatmap-months" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="heatmap-body">
            <div className="heatmap-days" aria-hidden="true">
              {weeks[0].map((d, i) => (
                <span key={d}>{i % 2 === 0 ? weekdayShort(d) : ""}</span>
              ))}
            </div>
            <div
              className="heatmap-grid"
              role="img"
              aria-label={`Study activity over the last ${HEAT_WEEKS} weeks; switch to the table for the numbers`}
            >
              {weeks.map((w) =>
                w.map((d) => {
                  const future = d > today;
                  const a = days.get(d);
                  return (
                    <span
                      key={d}
                      className={`heat heat-${future ? "x" : activityLevel(a)}${d === today ? " is-today" : ""}`}
                      onPointerEnter={(e) =>
                        !future &&
                        tip.show(
                          e.currentTarget,
                          activityText(a),
                          formatDate(d, today),
                        )
                      }
                    />
                  );
                }),
              )}
            </div>
          </div>
          <div className="heatmap-legend" aria-hidden="true">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`heat heat-${l}`} />
            ))}
            <span>More</span>
          </div>
          {tip.node}
        </div>
      )}
    </div>
  );
}

/* ---------- Column chart ---------- */

interface Column {
  key: string;
  /** Under the column (may be empty to thin out labels). */
  axis: string;
  value: number;
  /** Tooltip / table: what the column is. */
  name: string;
  /** Tooltip / table: the value, formatted. */
  text: string;
}

/** Columns from a single baseline; values printed only on the columns given in `labelled`. */
function ColumnChart({
  columns,
  labelled,
  label,
}: {
  columns: Column[];
  labelled: Set<string>;
  label: string;
}) {
  const tip = useTip();
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <div
      className="columns"
      ref={tip.box}
      onPointerLeave={tip.hide}
      role="img"
      aria-label={label}
    >
      <div className="columns-plot">
        {columns.map((c) => (
          <div
            key={c.key}
            className="column-slot"
            onPointerEnter={(e) =>
              tip.show(
                e.currentTarget.querySelector(".column-bar") ?? e.currentTarget,
                c.text,
                c.name,
              )
            }
          >
            <span
              className="column-bar"
              style={{ height: `${(c.value / max) * 100}%` }}
            >
              {labelled.has(c.key) && c.value > 0 && (
                <span className="column-value">{c.text}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="columns-axis" aria-hidden="true">
        {columns.map((c) => (
          <span key={c.key}>{c.axis}</span>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

function ColumnTable({
  columns,
  head,
}: {
  columns: Column[];
  head: [string, string];
}) {
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th>{head[0]}</th>
          <th>{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {columns.map((c) => (
          <tr key={c.key}>
            <td>{c.name}</td>
            <td>{c.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ForecastPanel({
  cards,
  today,
}: {
  cards: study.Card[];
  today: string;
}) {
  const [table, setTable] = useState(false);
  const { perDay, fresh } = useMemo(
    () => forecast(cards, today, FORECAST_DAYS),
    [cards, today],
  );
  const total = perDay.reduce((n, d) => n + d.count, 0);
  const columns: Column[] = perDay.map((d, i) => ({
    key: d.date,
    axis: i === 0 ? "Today" : i % 2 === 0 ? weekdayShort(d.date) : "",
    value: d.count,
    name: i === 0 ? "Today (and overdue)" : formatDate(d.date, today),
    text: `${d.count} ${d.count === 1 ? "card" : "cards"}`,
  }));
  const peak = perDay.reduce(
    (best, d) => (d.count > best.count ? d : best),
    perDay[0],
  );
  return (
    <section className="panel" aria-labelledby="forecast-title">
      <PanelHead
        id="forecast-title"
        icon={<CalendarClock size={16} aria-hidden="true" />}
        title="Coming due"
        meta="next 14 days"
        table={table}
        onTable={() => setTable((t) => !t)}
      />
      {total === 0 && fresh === 0 ? (
        <p className="panel-empty">
          No learned cards yet. Once you review cards, you'll see here when they
          come back.
        </p>
      ) : table ? (
        <ColumnTable columns={columns} head={["Day", "Cards due"]} />
      ) : (
        <ColumnChart
          columns={columns}
          labelled={new Set([perDay[0].date, peak.date])}
          label={`Cards coming due over the next ${FORECAST_DAYS} days: ${total} in total`}
        />
      )}
      {(total > 0 || fresh > 0) && (
        <p className="panel-note">
          {total} learned {total === 1 ? "card comes" : "cards come"} back in
          the next two weeks
          {fresh > 0 &&
            `, plus ${fresh} new ${fresh === 1 ? "card" : "cards"} not studied yet`}
          .
        </p>
      )}
    </section>
  );
}

function FocusPanel({
  focus,
  today,
}: {
  focus: study.FocusLogRow[];
  today: string;
}) {
  const [table, setTable] = useState(false);
  const weeks = useMemo(
    () => weeklyFocus(focus, today, FOCUS_WEEKS),
    [focus, today],
  );
  const total = weeks.reduce((n, w) => n + w.minutes, 0);
  const columns: Column[] = weeks.map((w, i) => ({
    key: w.week,
    axis:
      i === weeks.length - 1
        ? "This wk"
        : (FOCUS_WEEKS - 1 - i) % 3 === 0
          ? shortDate(w.week)
          : "",
    value: w.minutes,
    name: i === weeks.length - 1 ? "This week" : `Week of ${shortDate(w.week)}`,
    text: formatMinutes(w.minutes),
  }));
  const peak = weeks.reduce(
    (best, w) => (w.minutes > best.minutes ? w : best),
    weeks[0],
  );
  return (
    <section className="panel" aria-labelledby="focus-week-title">
      <PanelHead
        id="focus-week-title"
        icon={<TimerIcon size={16} aria-hidden="true" />}
        title="Focus per week"
        meta="last 12 weeks"
        table={table}
        onTable={() => setTable((t) => !t)}
      />
      {total === 0 ? (
        <p className="panel-empty">
          No focus time yet. Start the timer in the top bar; each round counts
          here.
        </p>
      ) : table ? (
        <ColumnTable columns={columns} head={["Week", "Focus"]} />
      ) : (
        <ColumnChart
          columns={columns}
          labelled={new Set([weeks[weeks.length - 1].week, peak.week])}
          label={`Focus time per week over the last ${FOCUS_WEEKS} weeks: ${formatMinutes(total)} in total`}
        />
      )}
      {total > 0 && (
        <p className="panel-note">
          {formatMinutes(total)} in {FOCUS_WEEKS} weeks, about{" "}
          {formatMinutes(total / FOCUS_WEEKS)} a week.
        </p>
      )}
    </section>
  );
}

/* ---------- Retention ---------- */

function RetentionPanel({
  reviews,
  courseIds,
  courseName,
  courseColor,
}: {
  reviews: study.ReviewLogRow[];
  courseIds: string[];
  courseName(id: string): string;
  courseColor(id: string): string;
}) {
  const byCourse = useMemo(() => retentionByCourse(reviews), [reviews]);
  const rows = courseIds
    .map((id) => ({ id, ret: byCourse.get(id) ?? { passed: 0, total: 0 } }))
    .filter((r) => r.ret.total > 0)
    .sort((a, b) => b.ret.total - a.ret.total);
  return (
    <section className="panel" aria-labelledby="retention-title">
      <PanelHead
        id="retention-title"
        icon={<TrendingUp size={16} aria-hidden="true" />}
        title="Retention"
        meta="last 30 days"
      />
      {rows.length === 0 ? (
        <p className="panel-empty">
          No answers to learned cards in the last 30 days. Retention shows once
          cards come back for review.
        </p>
      ) : (
        <ul className="retention-rows">
          {rows.map(({ id, ret }) => {
            const share = ret.passed / ret.total;
            const few = ret.total < MIN_ANSWERS;
            return (
              <li key={id}>
                <span className="retention-name">
                  <span
                    className="course-dot"
                    style={{ background: courseColor(id) }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{courseName(id)}</span>
                </span>
                <span className="meter" aria-hidden="true">
                  <span
                    className={`meter-fill${few ? " is-faint" : ""}`}
                    style={{ width: pct(share) }}
                  />
                  <span
                    className="meter-target"
                    style={{ left: pct(TARGET_RETENTION) }}
                  />
                </span>
                <span className="retention-value">
                  <strong>{pct(share)}</strong>
                  <span>
                    {ret.passed} of {ret.total}
                    {few && " · few"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="panel-note">
          How often you still knew a card you had learned. Lesepult schedules
          reviews to keep this near {pct(TARGET_RETENTION)} (the line); much
          lower means the cards may be too big or unclear.
        </p>
      )}
    </section>
  );
}

/* ---------- Exam readiness ---------- */

function ExamReadiness({
  exams,
  cards,
  focusTotals,
  today,
  courseColor,
  onCram,
  onOpenCourse,
}: {
  exams: study.DeadlineWithCourse[];
  cards: study.Card[];
  focusTotals: Map<string, number>;
  today: string;
  courseColor(id: string): string;
  onCram(courseId: string): void;
  onOpenCourse(courseId: string): void;
}) {
  if (exams.length === 0)
    return (
      <p className="panel-empty">
        No exams coming up. Add one in a course's overview to see how ready you
        are.
      </p>
    );
  return (
    <ul className="exam-rows">
      {exams.map((exam) => {
        const own = cards.filter((c) => c.courseId === exam.courseId);
        const at = examMoment(exam.date, exam.time);
        const recall = own.length
          ? own.reduce((n, c) => n + recallAt(c.srs, c.state, at), 0) /
            own.length
          : 0;
        const learned = own.filter((c) => c.state !== 0).length;
        const days = daysBetween(today, exam.date);
        return (
          <li key={exam.id} className="exam-row">
            <div className="exam-row-head">
              <button
                type="button"
                className="exam-row-course"
                onClick={() => onOpenCourse(exam.courseId)}
              >
                <span
                  className="course-dot"
                  style={{ background: courseColor(exam.courseId) }}
                  aria-hidden="true"
                />
                <span className="truncate">{exam.courseName}</span>
              </button>
              <span className={`exam-row-when${days <= 7 ? " is-close" : ""}`}>
                {countdown(exam.date, today)}
              </span>
            </div>
            <div className="exam-row-title">
              {exam.title} · {formatDate(exam.date, today)}
              {exam.time && `, ${exam.time}`}
            </div>
            {own.length === 0 ? (
              <p className="panel-empty">No flashcards in this course yet.</p>
            ) : (
              <>
                <div className="exam-recall">
                  <span className="meter" aria-hidden="true">
                    <span
                      className="meter-fill"
                      style={{ width: pct(recall) }}
                    />
                  </span>
                  <span className="retention-value">
                    <strong>{pct(recall)}</strong>
                    <span>expected recall</span>
                  </span>
                </div>
                <div className="exam-row-facts">
                  <span>
                    {learned} of {own.length} cards learned
                  </span>
                  <span>
                    {formatMinutes(focusTotals.get(exam.courseId) ?? 0)} focus
                    in total
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onCram(exam.courseId)}
                  >
                    <Zap size={13} aria-hidden="true" />
                    Cram all {own.length}
                  </button>
                </div>
              </>
            )}
          </li>
        );
      })}
      <li className="panel-note">
        Expected recall: the share of this course's cards you'd remember on exam
        day if you stopped reviewing now (new cards count as not known).
      </li>
    </ul>
  );
}
