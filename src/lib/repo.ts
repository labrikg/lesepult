import { type Db, now, uid } from "./db";

/* ---------- Types ---------- */

export interface Semester {
  id: string;
  name: string;
  position: number;
  collapsed: boolean;
}

export interface Course {
  id: string;
  semesterId: string;
  name: string;
  color: string;
  position: number;
  collapsed: boolean;
}

export interface PageSummary {
  id: string;
  courseId: string;
  documentId: string | null;
  title: string;
  position: number;
  updatedAt: string;
}

export interface Page extends PageSummary {
  content: string;
  plainText: string;
}

export interface DocumentSummary {
  id: string;
  courseId: string;
  title: string;
  position: number;
}

export interface CourseNode extends Course {
  pages: PageSummary[];
  documents: DocumentSummary[];
}

export interface SemesterNode extends Semester {
  courses: CourseNode[];
}

export interface SearchHit {
  pageId: string;
  title: string;
  courseName: string;
  courseColor: string;
  /** Excerpt with matches wrapped in \u0002 … \u0003. */
  snippet: string;
}

/** Course colours from the design spec, assigned in turn. */
export const COURSE_COLORS = ["#4A6741", "#A4552C", "#3D6A88", "#D4AB3E", "#6B4A7A"];

/* ---------- Row mapping ---------- */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0);

const toSemester = (r: Row): Semester => ({
  id: str(r.id),
  name: str(r.name),
  position: num(r.position),
  collapsed: num(r.collapsed) === 1,
});
const toCourse = (r: Row): Course => ({
  id: str(r.id),
  semesterId: str(r.semester_id),
  name: str(r.name),
  color: str(r.color),
  position: num(r.position),
  collapsed: num(r.collapsed) === 1,
});
const toPageSummary = (r: Row): PageSummary => ({
  id: str(r.id),
  courseId: str(r.course_id),
  documentId: r.document_id == null ? null : str(r.document_id),
  title: str(r.title),
  position: num(r.position),
  updatedAt: str(r.updated_at),
});
const toDocument = (r: Row): DocumentSummary => ({
  id: str(r.id),
  courseId: str(r.course_id),
  title: str(r.title),
  position: num(r.position),
});

async function nextPosition(db: Db, table: string, parentCol?: string, parentId?: string) {
  const where = parentCol ? ` WHERE ${parentCol} = $1` : "";
  const rows = await db.select<Row>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM ${table}${where}`,
    parentCol ? [parentId] : [],
  );
  return num(rows[0]?.pos ?? 1);
}

/* ---------- Tree ---------- */

export async function loadTree(db: Db): Promise<SemesterNode[]> {
  const [semesters, courses, pages, documents] = await Promise.all([
    db.select<Row>("SELECT * FROM semesters ORDER BY position"),
    db.select<Row>("SELECT * FROM courses ORDER BY position"),
    db.select<Row>(
      "SELECT id, course_id, document_id, title, position, updated_at FROM pages ORDER BY position",
    ),
    db.select<Row>("SELECT id, course_id, title, position FROM documents ORDER BY position"),
  ]);

  const courseNodes = new Map<string, CourseNode>();
  for (const r of courses) courseNodes.set(str(r.id), { ...toCourse(r), pages: [], documents: [] });
  for (const r of pages) courseNodes.get(str(r.course_id))?.pages.push(toPageSummary(r));
  for (const r of documents) courseNodes.get(str(r.course_id))?.documents.push(toDocument(r));

  const tree: SemesterNode[] = semesters.map((r) => ({ ...toSemester(r), courses: [] }));
  const bySemester = new Map(tree.map((s) => [s.id, s]));
  for (const c of courseNodes.values()) bySemester.get(c.semesterId)?.courses.push(c);
  return tree;
}

/* ---------- Semesters ---------- */

export async function createSemester(db: Db, name: string): Promise<string> {
  const id = uid();
  const position = await nextPosition(db, "semesters");
  await db.execute("INSERT INTO semesters (id, name, position) VALUES ($1, $2, $3)", [
    id,
    name.trim(),
    position,
  ]);
  return id;
}

export async function renameSemester(db: Db, id: string, name: string) {
  await db.execute("UPDATE semesters SET name = $1 WHERE id = $2", [name.trim(), id]);
}

export async function setSemesterCollapsed(db: Db, id: string, collapsed: boolean) {
  await db.execute("UPDATE semesters SET collapsed = $1 WHERE id = $2", [collapsed ? 1 : 0, id]);
}

export async function deleteSemester(db: Db, id: string) {
  await db.execute("DELETE FROM semesters WHERE id = $1", [id]);
}

/* ---------- Courses ---------- */

export async function createCourse(db: Db, semesterId: string, name: string): Promise<string> {
  const id = uid();
  const position = await nextPosition(db, "courses", "semester_id", semesterId);
  const count = await db.select<Row>("SELECT COUNT(*) AS n FROM courses");
  const color = COURSE_COLORS[num(count[0]?.n) % COURSE_COLORS.length];
  await db.execute(
    "INSERT INTO courses (id, semester_id, name, color, position) VALUES ($1, $2, $3, $4, $5)",
    [id, semesterId, name.trim(), color, position],
  );
  return id;
}

export async function renameCourse(db: Db, id: string, name: string) {
  await db.execute("UPDATE courses SET name = $1 WHERE id = $2", [name.trim(), id]);
}

export async function setCourseCollapsed(db: Db, id: string, collapsed: boolean) {
  await db.execute("UPDATE courses SET collapsed = $1 WHERE id = $2", [collapsed ? 1 : 0, id]);
}

export async function deleteCourse(db: Db, id: string) {
  await db.execute("DELETE FROM courses WHERE id = $1", [id]);
}

/* ---------- Pages (notes) ---------- */

export async function createPage(db: Db, courseId: string, title = ""): Promise<string> {
  const id = uid();
  const position = await nextPosition(db, "pages", "course_id", courseId);
  const ts = now();
  await db.execute(
    "INSERT INTO pages (id, course_id, title, position, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
    [id, courseId, title.trim(), position, ts],
  );
  return id;
}

export async function getPage(db: Db, id: string): Promise<Page | null> {
  const rows = await db.select<Row>("SELECT * FROM pages WHERE id = $1", [id]);
  const r = rows[0];
  if (!r) return null;
  return { ...toPageSummary(r), content: str(r.content), plainText: str(r.plain_text) };
}

export interface PagePatch {
  title?: string;
  content?: string;
  plainText?: string;
  documentId?: string | null;
}

export async function updatePage(db: Db, id: string, patch: PagePatch) {
  const cols: Record<keyof PagePatch, string> = {
    title: "title",
    content: "content",
    plainText: "plain_text",
    documentId: "document_id",
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of Object.keys(cols) as (keyof PagePatch)[]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${cols[key]} = $${params.length}`);
    }
  }
  if (sets.length === 0) return;
  params.push(now());
  sets.push(`updated_at = $${params.length}`);
  params.push(id);
  await db.execute(`UPDATE pages SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function deletePage(db: Db, id: string) {
  await db.execute("DELETE FROM pages WHERE id = $1", [id]);
}

/* ---------- Documents (PDFs) ---------- */

export interface Document extends DocumentSummary {
  fileName: string;
  storedPath: string;
  pageCount: number | null;
  sha256: string | null;
}

export interface StoredFile {
  fileName: string;
  storedPath: string;
  sha256: string;
}

const toDocumentFull = (r: Row): Document => ({
  ...toDocument(r),
  fileName: str(r.file_name),
  storedPath: str(r.stored_path),
  pageCount: r.page_count == null ? null : num(r.page_count),
  sha256: r.sha256 == null ? null : str(r.sha256),
});

/** "Lecture 07 - Hashing.pdf" → "Lecture 07 - Hashing" */
export const titleFromFileName = (name: string) => name.replace(/\.pdf$/i, "").trim() || "Document";

export async function createDocument(db: Db, courseId: string, file: StoredFile): Promise<string> {
  const id = uid();
  const position = await nextPosition(db, "documents", "course_id", courseId);
  await db.execute(
    `INSERT INTO documents (id, course_id, title, file_name, stored_path, sha256, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, courseId, titleFromFileName(file.fileName), file.fileName, file.storedPath, file.sha256, position],
  );
  return id;
}

export async function getDocument(db: Db, id: string): Promise<Document | null> {
  const rows = await db.select<Row>("SELECT * FROM documents WHERE id = $1", [id]);
  return rows[0] ? toDocumentFull(rows[0]) : null;
}

export async function setDocumentPageCount(db: Db, id: string, pageCount: number) {
  await db.execute("UPDATE documents SET page_count = $1 WHERE id = $2 AND page_count IS NOT $1", [
    pageCount,
    id,
  ]);
}

/**
 * Detaches a page's PDF. If no other page uses that PDF any more, its row is deleted too and the
 * stored file path is returned so the caller can delete the file.
 */
export async function detachDocument(db: Db, pageId: string): Promise<string | null> {
  const page = await getPage(db, pageId);
  if (!page?.documentId) return null;
  const docId = page.documentId;
  await updatePage(db, pageId, { documentId: null });
  const users = await db.select<Row>("SELECT COUNT(*) AS n FROM pages WHERE document_id = $1", [docId]);
  if (num(users[0]?.n) > 0) return null;
  const doc = await getDocument(db, docId);
  await db.execute("DELETE FROM documents WHERE id = $1", [docId]);
  return doc?.storedPath ?? null;
}

export async function renameDocument(db: Db, id: string, title: string) {
  await db.execute("UPDATE documents SET title = $1 WHERE id = $2", [title.trim(), id]);
}

/**
 * Moves a page to another course (appended at the end). Its PDF moves along unless another
 * page that stays behind still uses it.
 */
export async function movePage(db: Db, pageId: string, courseId: string) {
  const page = await getPage(db, pageId);
  if (!page || page.courseId === courseId) return;
  const position = await nextPosition(db, "pages", "course_id", courseId);
  await db.execute("UPDATE pages SET course_id = $1, position = $2 WHERE id = $3", [
    courseId,
    position,
    pageId,
  ]);
  if (page.documentId) {
    const others = await db.select<Row>(
      "SELECT COUNT(*) AS n FROM pages WHERE document_id = $1 AND id <> $2 AND course_id <> $3",
      [page.documentId, pageId, courseId],
    );
    if (num(others[0]?.n) === 0) {
      const docPos = await nextPosition(db, "documents", "course_id", courseId);
      await db.execute("UPDATE documents SET course_id = $1, position = $2 WHERE id = $3", [
        courseId,
        docPos,
        page.documentId,
      ]);
    }
  }
}

/* ---------- Highlights ---------- */

export type HighlightColor = "yellow" | "blue" | "green";

/** A rectangle in page-relative units (0..1 of the page width/height). */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Highlight {
  id: string;
  documentId: string;
  pageNumber: number;
  rects: NormRect[];
  color: HighlightColor;
  text: string;
  comment: string | null;
  createdAt: string;
}

const toHighlight = (r: Row): Highlight => {
  let rects: NormRect[] = [];
  try {
    rects = JSON.parse(str(r.rects));
  } catch {
    rects = [];
  }
  return {
    id: str(r.id),
    documentId: str(r.document_id),
    pageNumber: num(r.page_number),
    rects,
    color: str(r.color) as HighlightColor,
    text: str(r.text),
    comment: r.comment == null || r.comment === "" ? null : str(r.comment),
    createdAt: str(r.created_at),
  };
};

export async function listHighlights(db: Db, documentId: string): Promise<Highlight[]> {
  const rows = await db.select<Row>(
    "SELECT * FROM highlights WHERE document_id = $1 ORDER BY page_number, created_at",
    [documentId],
  );
  return rows.map(toHighlight);
}

export async function createHighlight(
  db: Db,
  h: Omit<Highlight, "id" | "createdAt" | "comment"> & { comment?: string | null },
): Promise<Highlight> {
  const id = uid();
  const createdAt = now();
  await db.execute(
    `INSERT INTO highlights (id, document_id, page_number, rects, color, text, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, h.documentId, h.pageNumber, JSON.stringify(h.rects), h.color, h.text, h.comment ?? null, createdAt],
  );
  return { ...h, id, createdAt, comment: h.comment ?? null };
}

export async function updateHighlight(
  db: Db,
  id: string,
  patch: { color?: HighlightColor; comment?: string | null },
) {
  if (patch.color !== undefined)
    await db.execute("UPDATE highlights SET color = $1 WHERE id = $2", [patch.color, id]);
  if (patch.comment !== undefined)
    await db.execute("UPDATE highlights SET comment = $1 WHERE id = $2", [
      patch.comment?.trim() ? patch.comment.trim() : null,
      id,
    ]);
}

export async function deleteHighlight(db: Db, id: string) {
  await db.execute("DELETE FROM highlights WHERE id = $1", [id]);
}

/** Every file path the database still refers to; anything else in the documents folder is an orphan. */
export async function listStoredPaths(db: Db): Promise<string[]> {
  const rows = await db.select<Row>(
    "SELECT stored_path AS p FROM documents UNION SELECT image_path AS p FROM snips",
  );
  return rows.map((r) => str(r.p));
}

/* ---------- Search ---------- */

/** Turns free text into a safe FTS5 query: every word becomes a quoted prefix term. */
export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((w) => w.replace(/"/g, "").trim())
    .filter(Boolean)
    .map((w) => `"${w}"*`)
    .join(" ");
}

export async function searchPages(db: Db, input: string, limit = 20): Promise<SearchHit[]> {
  const q = toFtsQuery(input);
  if (!q) return [];
  const rows = await db.select<Row>(
    `SELECT f.page_id, p.title, c.name AS course_name, c.color AS course_color,
            snippet(pages_fts, 2, char(2), char(3), '…', 12) AS snip
       FROM pages_fts f
       JOIN pages p ON p.id = f.page_id
       JOIN courses c ON c.id = p.course_id
      WHERE pages_fts MATCH $1
      ORDER BY f.rank
      LIMIT $2`,
    [q, limit],
  );
  return rows.map((r) => ({
    pageId: str(r.page_id),
    title: str(r.title),
    courseName: str(r.course_name),
    courseColor: str(r.course_color),
    snippet: str(r.snip),
  }));
}

/* ---------- UI state ---------- */

export async function kvGet(db: Db, key: string): Promise<string | null> {
  const rows = await db.select<Row>("SELECT value FROM kv WHERE key = $1", [key]);
  return rows[0] ? str(rows[0].value) : null;
}

export async function kvSet(db: Db, key: string, value: string) {
  await db.execute(
    "INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
