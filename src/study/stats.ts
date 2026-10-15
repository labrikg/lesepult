import { addDays, daysBetween, todayISO } from "./dates";

/*
 * Statistics from the review log and focus sessions, as pure functions (dates are local
 * calendar days, YYYY-MM-DD; timestamps are ISO).
 */

/** The local calendar day of a timestamp. */
export const localDay = (iso: string) => todayISO(new Date(iso));

export interface DayActivity {
  reviews: number;
  minutes: number;
}

/** Cards answered and focus minutes per day. */
export function dailyActivity(
  reviews: readonly { reviewedAt: string }[],
  focus: readonly { startedAt: string; minutes: number }[],
): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();
  const day = (d: string) => {
    let a = days.get(d);
    if (!a) days.set(d, (a = { reviews: 0, minutes: 0 }));
    return a;
  };
  for (const r of reviews) day(localDay(r.reviewedAt)).reviews++;
  for (const f of focus) day(localDay(f.startedAt)).minutes += f.minutes;
  return days;
}

/**
 * How dark a day is in the heatmap (0–4). Answers and focus time are put on one scale by
 * counting a card as about 15 seconds; then: some, ¼ h, ¾ h, 1½ h or more.
 */
export function activityLevel(a: DayActivity | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!a || (a.reviews === 0 && a.minutes < 0.5)) return 0;
  const score = a.minutes + a.reviews / 4;
  if (score >= 90) return 4;
  if (score >= 45) return 3;
  if (score >= 15) return 2;
  return 1;
}

const active = (a: DayActivity | undefined) => !!a && (a.reviews > 0 || a.minutes >= 0.5);

/**
 * Days in a row with some study. The current streak still counts while today is empty
 * (it's only broken once a whole day passes without anything).
 */
export function streaks(days: Map<string, DayActivity>, today: string): { current: number; longest: number } {
  let current = 0;
  let d = active(days.get(today)) ? today : addDays(today, -1);
  while (active(days.get(d))) {
    current++;
    d = addDays(d, -1);
  }
  const dates = [...days.keys()].filter((k) => active(days.get(k))).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of dates) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { current, longest: Math.max(longest, current) };
}

/** The heatmap's grid: columns of weeks (Monday first), the last one holding today. */
export function heatmapWeeks(today: string, weeks: number): string[][] {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const firstMonday = addDays(today, -weekday - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(firstMonday, w * 7 + i)));
}

export interface ScheduledCard {
  state: number;
  due: string;
}

/**
 * Learned cards coming due on each of the next days (index 0 = today, overdue included), plus
 * how many new cards are waiting.
 */
export function forecast(cards: readonly ScheduledCard[], today: string, days: number) {
  const perDay = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), count: 0 }));
  let fresh = 0;
  for (const c of cards) {
    if (c.state === 0) {
      fresh++;
      continue;
    }
    const i = Math.max(0, daysBetween(today, localDay(c.due)));
    if (i < days) perDay[i].count++;
  }
  return { perDay, fresh };
}

export interface Retention {
  /** Answers to learned cards that weren't "Again". */
  passed: number;
  total: number;
}

/**
 * How often learned cards were remembered, per course: only answers to cards in review (not
 * new or still-learning ones), and not cram answers.
 */
export function retentionByCourse(
  reviews: readonly { rating: number; state: number; cram: boolean; courseId: string }[],
): Map<string, Retention> {
  const out = new Map<string, Retention>();
  for (const r of reviews) {
    if (r.cram || r.state !== 2) continue;
    const ret = out.get(r.courseId) ?? { passed: 0, total: 0 };
    ret.total++;
    if (r.rating > 1) ret.passed++;
    out.set(r.courseId, ret);
  }
  return out;
}

/** Focus minutes per week (Monday dates), for the last `weeks` weeks including this one. */
export function weeklyFocus(focus: readonly { startedAt: string; minutes: number }[], today: string, weeks: number) {
  const cols = heatmapWeeks(today, weeks).map((w) => ({ week: w[0], minutes: 0 }));
  const first = cols[0].week;
  for (const f of focus) {
    const i = Math.floor(daysBetween(first, localDay(f.startedAt)) / 7);
    if (i >= 0 && i < cols.length) cols[i].minutes += f.minutes;
  }
  return cols;
}

/** The moment of an exam: its date at its time, or 9:00 if it has none. */
export function examMoment(date: string, time: string | null): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}
