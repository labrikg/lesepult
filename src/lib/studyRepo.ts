import { type Db, now, uid } from "./db";

/* SQL for the v2 study tools: flashcards, reviews, deadlines and to-dos. */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0);
const marks = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `$${i + from}`).join(", ");

/* ---------- Flashcards ---------- */

/** 0 new, 1 learning, 2 review, 3 relearning (the FSRS states). */
export type CardState = 0 | 1 | 2 | 3;

export interface CardBlock {
  blockId: string;
  front: string;
  back: string;
  highlightId?: string | null;
}

export interface Card {
  id: string;
  pageId: string;
  blockId: string;
  front: string;
  back: string;
  highlightId: string | null;
  srs: string | null;
  state: CardState;
  due: string;
  pageTitle: string;
  courseId: string;
  courseName: string;
  courseColor: string;
}

const toCard = (r: Row): Card => ({
  id: str(r.id),
  pageId: str(r.page_id),
  blockId: str(r.block_id),
  front: str(r.front),
  back: str(r.back),
  highlightId: r.highlight_id == null ? null : str(r.highlight_id),
  srs: r.srs == null ? null : str(r.srs),
  state: num(r.state) as CardState,
  due: str(r.due),
  pageTitle: str(r.page_title),
  courseId: str(r.course_id),
  courseName: str(r.course_name),
  courseColor: str(r.course_color),
});

const CARD_SELECT = `
  SELECT k.*, p.title AS page_title, c.id AS course_id, c.name AS course_name, c.color AS course_color
    FROM cards k JOIN pages p ON p.id = k.page_id JOIN courses c ON c.id = p.course_id`;

/**
 * Makes the cards table match the card blocks currently in a note: new blocks become new cards,
 * edited ones keep their review history, removed ones are deleted.
 */
export async function syncCards(db: Db, pageId: string, blocks: CardBlock[]) {
  const existing = await db.select<Row>("SELECT id, block_id, front, back, highlight_id FROM cards WHERE page_id = $1", [
    pageId,
  ]);
  const byBlock = new Map(existing.map((r) => [str(r.block_id), r]));
  const seen = new Set<string>();
  for (const b of blocks) {
    if (seen.has(b.blockId)) continue;
    seen.add(b.blockId);
    const row = byBlock.get(b.blockId);
    const highlightId = b.highlightId || null;
    if (!row) {
      await db.execute(
        `INSERT INTO cards (id, page_id, block_id, front, back, highlight_id, due)
         SELECT $1, $2, $3, $4, $5, (SELECT id FROM highlights WHERE id = $6), $7`,
        [uid(), pageId, b.blockId, b.front, b.back, highlightId, now()],
      );
    } else if (str(row.front) !== b.front || str(row.back) !== b.back || (row.highlight_id ?? null) !== highlightId) {
      await db.execute(
        `UPDATE cards SET front = $1, back = $2, highlight_id = (SELECT id FROM highlights WHERE id = $3)
          WHERE id = $4`,
        [b.front, b.back, highlightId, str(row.id)],
      );
    }
  }
  const gone = existing.filter((r) => !seen.has(str(r.block_id))).map((r) => str(r.id));
  if (gone.length) await db.execute(`DELETE FROM cards WHERE id IN (${marks(gone.length)})`, gone);
}

/** All cards (of one course, if given), oldest first. */
export async function listCards(db: Db, courseId?: string): Promise<Card[]> {
  const rows = courseId
    ? await db.select<Row>(`${CARD_SELECT} WHERE c.id = $1 ORDER BY k.created_at`, [courseId])
    : await db.select<Row>(`${CARD_SELECT} ORDER BY k.created_at`);
  return rows.map(toCard);
}

/** Cards whose review is due by `at` (of one course, if given): learning cards first, then by due time. */
export async function dueCards(db: Db, at: string, courseId?: string): Promise<Card[]> {
  const where = courseId ? "AND c.id = $2" : "";
  const rows = await db.select<Row>(
    `${CARD_SELECT} WHERE k.due <= $1 ${where}
      ORDER BY CASE k.state WHEN 1 THEN 0 WHEN 3 THEN 0 WHEN 2 THEN 1 ELSE 2 END, k.due`,
    courseId ? [at, courseId] : [at],
  );
  return rows.map(toCard);
}

export interface CardCounts {
  courseId: string;
  total: number;
  /** Never reviewed. */
  fresh: number;
  /** Due by the given time (new ones included). */
  due: number;
  /** In review with an interval of three weeks or more. */
  mature: number;
}

/** Card numbers per course. */
export async function cardCounts(db: Db, at: string): Promise<CardCounts[]> {
  const rows = await db.select<Row>(
    `SELECT p.course_id,
            COUNT(*) AS total,
            SUM(k.state = 0) AS fresh,
            SUM(k.due <= $1) AS due,
            SUM(k.state = 2 AND json_extract(k.srs, '$.scheduled_days') >= 21) AS mature
       FROM cards k JOIN pages p ON p.id = k.page_id
      GROUP BY p.course_id`,
    [at],
  );
  return rows.map((r) => ({
    courseId: str(r.course_id),
    total: num(r.total),
    fresh: num(r.fresh),
    due: num(r.due),
    mature: num(r.mature),
  }));
}

export interface ReviewResult {
  srs: string;
  state: CardState;
  due: string;
  rating: number;
  /** The card's state before the answer. */
  previousState: CardState;
  scheduledDays: number;
  reviewedAt: string;
}

/** Stores an answer: the card's new schedule plus a log row. */
export async function recordReview(db: Db, cardId: string, r: ReviewResult) {
  await db.execute("UPDATE cards SET srs = $1, state = $2, due = $3 WHERE id = $4", [r.srs, r.state, r.due, cardId]);
  await db.execute(
    "INSERT INTO reviews (id, card_id, rating, state, scheduled_days, reviewed_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [uid(), cardId, r.rating, r.previousState, r.scheduledDays, r.reviewedAt],
  );
}

/** Logs a cram answer: counts as activity, but leaves the card's schedule alone. */
export async function recordCramAnswer(db: Db, cardId: string, knew: boolean, state: CardState) {
  await db.execute(
    "INSERT INTO reviews (id, card_id, rating, state, scheduled_days, reviewed_at, cram) VALUES ($1, $2, $3, $4, 0, $5, 1)",
    [uid(), cardId, knew ? 3 : 1, state, now()],
  );
}

/** Puts a card back to new (forgets its schedule; the review log stays). */
export async function resetCard(db: Db, cardId: string) {
  await db.execute("UPDATE cards SET srs = NULL, state = 0, due = $1 WHERE id = $2", [now(), cardId]);
}

/** Reviews per day (local dates given as YYYY-MM-DD boundaries are the caller's job). */
export async function reviewsSince(db: Db, since: string): Promise<{ reviewedAt: string; rating: number }[]> {
  const rows = await db.select<Row>("SELECT reviewed_at, rating FROM reviews WHERE reviewed_at >= $1 ORDER BY reviewed_at", [
    since,
  ]);
  return rows.map((r) => ({ reviewedAt: str(r.reviewed_at), rating: num(r.rating) }));
}

/* ---------- Deadlines & exams ---------- */

export type DeadlineKind = "exam" | "deadline" | "other";

export interface Deadline {
  id: string;
  courseId: string;
  title: string;
  kind: DeadlineKind;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM or null */
  time: string | null;
  done: boolean;
}

export interface DeadlineWithCourse extends Deadline {
  courseName: string;
  courseColor: string;
}

const toDeadline = (r: Row): DeadlineWithCourse => ({
  id: str(r.id),
  courseId: str(r.course_id),
  title: str(r.title),
  kind: (["exam", "deadline", "other"].includes(str(r.kind)) ? str(r.kind) : "other") as DeadlineKind,
  date: str(r.date),
  time: r.time == null || r.time === "" ? null : str(r.time),
  done: num(r.done) === 1,
  courseName: str(r.course_name),
  courseColor: str(r.course_color),
});

/** Dates by day and time; of one course, or all from a date on. */
export async function listDeadlines(db: Db, opts: { courseId?: string; from?: string } = {}): Promise<DeadlineWithCourse[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.courseId) {
    params.push(opts.courseId);
    where.push(`d.course_id = $${params.length}`);
  }
  if (opts.from) {
    params.push(opts.from);
    where.push(`d.date >= $${params.length}`);
  }
  const rows = await db.select<Row>(
    `SELECT d.*, c.name AS course_name, c.color AS course_color
       FROM deadlines d JOIN courses c ON c.id = d.course_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY d.date, COALESCE(d.time, '99:99'), d.title`,
    params,
  );
  return rows.map(toDeadline);
}

export interface DeadlineInput {
  title: string;
  kind: DeadlineKind;
  date: string;
  time?: string | null;
}

export async function createDeadline(db: Db, courseId: string, d: DeadlineInput): Promise<string> {
  const id = uid();
  await db.execute(
    "INSERT INTO deadlines (id, course_id, title, kind, date, time) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, courseId, d.title.trim() || "Untitled", d.kind, d.date, d.time || null],
  );
  return id;
}

export async function updateDeadline(db: Db, id: string, patch: Partial<DeadlineInput> & { done?: boolean }) {
  const cols: [string, unknown][] = [];
  if (patch.title !== undefined) cols.push(["title", patch.title.trim() || "Untitled"]);
  if (patch.kind !== undefined) cols.push(["kind", patch.kind]);
  if (patch.date !== undefined) cols.push(["date", patch.date]);
  if (patch.time !== undefined) cols.push(["time", patch.time || null]);
  if (patch.done !== undefined) cols.push(["done", patch.done ? 1 : 0]);
  if (!cols.length) return;
  await db.execute(
    `UPDATE deadlines SET ${cols.map(([c], i) => `${c} = $${i + 1}`).join(", ")} WHERE id = $${cols.length + 1}`,
    [...cols.map(([, v]) => v), id],
  );
}

export async function deleteDeadline(db: Db, id: string) {
  await db.execute("DELETE FROM deadlines WHERE id = $1", [id]);
}

/* ---------- To-dos ---------- */

export interface Todo {
  id: string;
  courseId: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  position: number;
  courseName: string;
  courseColor: string;
}

const toTodo = (r: Row): Todo => ({
  id: str(r.id),
  courseId: str(r.course_id),
  title: str(r.title),
  done: num(r.done) === 1,
  dueDate: r.due_date == null || r.due_date === "" ? null : str(r.due_date),
  position: num(r.position),
  courseName: str(r.course_name),
  courseColor: str(r.course_color),
});

/** To-dos of one course (or all), open ones first, then by due date and order of creation. */
export async function listTodos(db: Db, opts: { courseId?: string; openOnly?: boolean } = {}): Promise<Todo[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.courseId) {
    params.push(opts.courseId);
    where.push(`t.course_id = $${params.length}`);
  }
  if (opts.openOnly) where.push("t.done = 0");
  const rows = await db.select<Row>(
    `SELECT t.*, c.name AS course_name, c.color AS course_color
       FROM todos t JOIN courses c ON c.id = t.course_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.done, COALESCE(t.due_date, '9999-99-99'), t.position`,
    params,
  );
  return rows.map(toTodo);
}

export async function createTodo(db: Db, courseId: string, title: string, dueDate: string | null = null): Promise<string> {
  const id = uid();
  const pos = await db.select<Row>("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM todos WHERE course_id = $1", [courseId]);
  await db.execute("INSERT INTO todos (id, course_id, title, due_date, position) VALUES ($1, $2, $3, $4, $5)", [
    id,
    courseId,
    title.trim(),
    dueDate,
    num(pos[0]?.p ?? 1),
  ]);
  return id;
}

export async function updateTodo(db: Db, id: string, patch: { title?: string; done?: boolean; dueDate?: string | null }) {
  if (patch.title !== undefined && patch.title.trim())
    await db.execute("UPDATE todos SET title = $1 WHERE id = $2", [patch.title.trim(), id]);
  if (patch.done !== undefined)
    await db.execute("UPDATE todos SET done = $1, done_at = $2 WHERE id = $3", [
      patch.done ? 1 : 0,
      patch.done ? now() : null,
      id,
    ]);
  if (patch.dueDate !== undefined) await db.execute("UPDATE todos SET due_date = $1 WHERE id = $2", [patch.dueDate, id]);
}

export async function deleteTodo(db: Db, id: string) {
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
}

/** Done / total to-dos per course, for progress bars. */
export async function todoProgress(db: Db): Promise<Map<string, { done: number; total: number }>> {
  const rows = await db.select<Row>("SELECT course_id, SUM(done) AS done, COUNT(*) AS total FROM todos GROUP BY course_id");
  return new Map(rows.map((r) => [str(r.course_id), { done: num(r.done), total: num(r.total) }]));
}

/* ---------- Focus sessions (Pomodoro) ---------- */

export interface FocusInput {
  courseId: string | null;
  startedAt: string;
  endedAt: string;
  minutes: number;
  /** False when stopped before the timer ran out. */
  completed: boolean;
}

export async function logFocus(db: Db, f: FocusInput) {
  await db.execute(
    `INSERT INTO focus_sessions (id, course_id, started_at, ended_at, minutes, completed)
     VALUES ($1, (SELECT id FROM courses WHERE id = $2), $3, $4, $5, $6)`,
    [uid(), f.courseId, f.startedAt, f.endedAt, Math.round(f.minutes * 10) / 10, f.completed ? 1 : 0],
  );
}

export interface FocusStats {
  minutes: number;
  /** Completed focus rounds. */
  rounds: number;
  /** Minutes per course (key "" = no course). */
  byCourse: Map<string, number>;
}

/** Focus time since a moment (ISO), in total and per course. */
export async function focusStats(db: Db, since: string): Promise<FocusStats> {
  const rows = await db.select<Row>(
    `SELECT COALESCE(course_id, '') AS course_id, SUM(minutes) AS minutes, SUM(completed) AS rounds
       FROM focus_sessions WHERE started_at >= $1 GROUP BY COALESCE(course_id, '')`,
    [since],
  );
  const byCourse = new Map(rows.map((r) => [str(r.course_id), num(r.minutes)]));
  return {
    minutes: rows.reduce((n, r) => n + num(r.minutes), 0),
    rounds: rows.reduce((n, r) => n + num(r.rounds), 0),
    byCourse,
  };
}

/* ---------- Statistics ---------- */

export interface ReviewLogRow {
  reviewedAt: string;
  rating: number;
  /** The card's state before the answer (2 = it was a learned card). */
  state: number;
  cram: boolean;
  courseId: string;
}

/** Every answer since a moment (of one course, if given), oldest first. */
export async function reviewLog(db: Db, since: string, courseId?: string | null): Promise<ReviewLogRow[]> {
  const rows = await db.select<Row>(
    `SELECT r.reviewed_at, r.rating, r.state, r.cram, p.course_id
       FROM reviews r JOIN cards k ON k.id = r.card_id JOIN pages p ON p.id = k.page_id
      WHERE r.reviewed_at >= $1 ${courseId ? "AND p.course_id = $2" : ""}
      ORDER BY r.reviewed_at`,
    courseId ? [since, courseId] : [since],
  );
  return rows.map((r) => ({
    reviewedAt: str(r.reviewed_at),
    rating: num(r.rating),
    state: num(r.state),
    cram: num(r.cram) === 1,
    courseId: str(r.course_id),
  }));
}

export interface FocusLogRow {
  startedAt: string;
  minutes: number;
  courseId: string | null;
}

/** Every focus stretch since a moment (of one course, if given). */
export async function focusLog(db: Db, since: string, courseId?: string | null): Promise<FocusLogRow[]> {
  const rows = await db.select<Row>(
    `SELECT started_at, minutes, course_id FROM focus_sessions
      WHERE started_at >= $1 ${courseId ? "AND course_id = $2" : ""} ORDER BY started_at`,
    courseId ? [since, courseId] : [since],
  );
  return rows.map((r) => ({
    startedAt: str(r.started_at),
    minutes: num(r.minutes),
    courseId: r.course_id == null ? null : str(r.course_id),
  }));
}

/** Total focus minutes per course (all time). */
export async function focusTotals(db: Db): Promise<Map<string, number>> {
  const rows = await db.select<Row>(
    "SELECT course_id, SUM(minutes) AS minutes FROM focus_sessions WHERE course_id IS NOT NULL GROUP BY course_id",
  );
  return new Map(rows.map((r) => [str(r.course_id), num(r.minutes)]));
}
