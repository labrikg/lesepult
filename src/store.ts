import { create } from "zustand";
import { getDb } from "./lib/db";
import * as repo from "./lib/repo";
import type { Document, Folder, Page, PagePatch, SemesterNode, Tag, TagColor, TagInfo } from "./lib/repo";
import { pickAndImportPdf, pruneStoredFiles, removeStoredFile } from "./lib/files";
import { extractCards, extractNoteRefs } from "./editor/content";
import * as study from "./lib/studyRepo";
import { todayISO } from "./study/dates";
import { repairOldPdfText } from "./lib/repair";
import { indexPdfs } from "./pdf/indexer";
import {
  applyTheme,
  readDarkPdf,
  readThemePref,
  resolveTheme,
  saveDarkPdf,
  saveThemePref,
  type ResolvedTheme,
  type ThemePref,
} from "./lib/theme";

export type ViewMode = "pdf" | "split" | "note";

/** What the main area shows: the open page, the Today overview, or a course's overview. */
export type MainView = { kind: "page" } | { kind: "today" } | { kind: "course"; courseId: string };

interface State {
  ready: boolean;
  error: string | null;
  tree: SemesterNode[];
  selectedPageId: string | null;
  page: Page | null;
  /** The PDF attached to the open page, if any. */
  pdf: Document | null;
  viewMode: ViewMode;
  searchOpen: boolean;

  /** Blocks waiting to be inserted into the open note (e.g. "Send to note" from the PDF). */
  noteQueue: unknown[];
  /** Ask the note editor to scroll to and flash a block. */
  focusBlock: { pageId: string; blockId: string; nonce: number } | null;
  /** Ask the PDF viewer to scroll to a page (and highlight). */
  pdfJump: { documentId: string; pageNumber: number; highlightId?: string; nonce: number } | null;
  /** Open the PDF's find bar with a search (from ⌘K), starting at a page. */
  pdfFind: { documentId: string; query: string; pageNumber: number; nonce: number } | null;
  /** While PDFs are being read for search: progress. */
  pdfIndexing: { done: number; total: number; title: string } | null;
  /** Bumped whenever note ↔ highlight links change, so the viewer reloads its "In note" chips. */
  refsVersion: number;
  /** Short confirmation shown in a toast (e.g. after an export). */
  notice: string | null;
  /** Saves the open note right away (registered by the note pane); used before exporting. */
  flushNote: (() => Promise<void>) | null;

  view: MainView;
  /** Bumped whenever cards, dates or to-dos change, so study views reload. */
  studyVersion: number;
  /** An open review session (null: none); courseId null = all courses. */
  review: { courseId: string | null } | null;
  /** Small study facts the sidebar shows: cards due now, and each course's next exam. */
  studyMeta: { dueCards: number; nextExam: Record<string, { date: string; title: string }> };
  loadStudyMeta(): Promise<void>;
  openToday(): void;
  openCourse(courseId: string): void;
  bumpStudy(): void;
  startReview(courseId: string | null): void;
  endReview(): void;

  /** Tags in use (with counts), the open page's tags, and the sidebar's tag filter. */
  tags: TagInfo[];
  pageTags: Tag[];
  tagFilter: { tagId: string; pageIds: Set<string> } | null;
  addTag(name: string): Promise<void>;
  removeTag(tagId: string): Promise<void>;
  renameTag(tagId: string, name: string): Promise<void>;
  setTagColor(tagId: string, color: TagColor): Promise<void>;
  deleteTag(tagId: string): Promise<void>;
  /** Shows only pages with this tag in the sidebar (null shows everything). */
  setTagFilter(tagId: string | null): Promise<void>;

  /** Appearance: what the user picked, what that means right now, and whether PDFs go dark too. */
  themePref: ThemePref;
  theme: ResolvedTheme;
  darkPdf: boolean;
  setThemePref(pref: ThemePref): void;
  setDarkPdf(on: boolean): void;
  /** Re-evaluates "system" after the OS switched between light and dark. */
  syncSystemTheme(): void;

  init(): Promise<void>;
  refresh(): Promise<void>;
  selectPage(id: string | null): Promise<void>;
  setViewMode(mode: ViewMode): void;
  setSearchOpen(open: boolean): void;

  addSemester(name: string): Promise<void>;
  renameSemester(id: string, name: string): Promise<void>;
  toggleSemester(id: string): Promise<void>;
  deleteSemester(id: string): Promise<void>;

  addCourse(semesterId: string, name: string): Promise<void>;
  renameCourse(id: string, name: string): Promise<void>;
  toggleCourse(id: string): Promise<void>;
  deleteCourse(id: string): Promise<void>;

  addPage(courseId: string, folderId?: string | null): Promise<void>;
  savePage(id: string, patch: PagePatch): Promise<void>;
  deletePage(id: string): Promise<void>;

  movePage(pageId: string, courseId: string, folderId?: string | null): Promise<void>;

  addFolder(courseId: string, parentId: string | null, name: string): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  toggleFolder(id: string): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  moveFolder(id: string, courseId: string, parentId: string | null): Promise<void>;

  attachPdf(): Promise<void>;
  removePdf(): Promise<void>;
  renamePdf(title: string): Promise<void>;
  /** Shows the open page's own PDF again after jumping to another one. */
  showPagePdf(): Promise<void>;

  sendToNote(blocks: unknown[]): void;
  takeNoteQueue(): unknown[];
  focusNoteBlock(pageId: string, blockId: string): Promise<void>;
  jumpToPdf(documentId: string, pageNumber: number, highlightId?: string): Promise<void>;
  /** Opens a PDF search hit: its note, the PDF at that page, and the find bar with the search. */
  openPdfHit(pageId: string, documentId: string, pageNumber: number, query: string): Promise<void>;
}

/** Wraps an action so a database failure shows up in the UI instead of vanishing. */
function guard<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error(e);
      useStore.setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  error: null,
  tree: [],
  selectedPageId: null,
  page: null,
  pdf: null,
  viewMode: "split",
  searchOpen: false,
  noteQueue: [],
  focusBlock: null,
  pdfJump: null,
  pdfFind: null,
  pdfIndexing: null,
  refsVersion: 0,
  notice: null,
  flushNote: null,

  view: { kind: "page" },
  studyVersion: 0,
  review: null,
  openToday() {
    set({ view: { kind: "today" } });
    getDb().then((db) => repo.kvSet(db, "mainView", "today"));
  },
  openCourse(courseId) {
    set({ view: { kind: "course", courseId } });
    getDb().then((db) => repo.kvSet(db, "mainView", `course:${courseId}`));
  },
  bumpStudy() {
    set((s) => ({ studyVersion: s.studyVersion + 1 }));
    get().loadStudyMeta();
  },
  studyMeta: { dueCards: 0, nextExam: {} },
  loadStudyMeta: guard(async () => {
    const db = await getDb();
    const [counts, exams] = await Promise.all([
      study.cardCounts(db, new Date().toISOString()),
      study.listDeadlines(db, { from: todayISO() }),
    ]);
    const nextExam: Record<string, { date: string; title: string }> = {};
    for (const d of exams)
      if (d.kind === "exam" && !nextExam[d.courseId]) nextExam[d.courseId] = { date: d.date, title: d.title };
    set({ studyMeta: { dueCards: counts.reduce((n, c) => n + c.due, 0), nextExam } });
  }),
  startReview(courseId) {
    get().flushNote?.().catch(() => {});
    set({ review: { courseId } });
  },
  endReview() {
    set({ review: null });
    get().bumpStudy();
  },

  tags: [],
  pageTags: [],
  tagFilter: null,

  addTag: guard(async (name) => {
    const page = get().page;
    if (!page) return;
    await repo.tagPage(await getDb(), page.id, name);
    await reloadTags(get, set);
  }),
  removeTag: guard(async (tagId) => {
    const page = get().page;
    if (!page) return;
    await repo.untagPage(await getDb(), page.id, tagId);
    await reloadTags(get, set);
  }),
  renameTag: guard(async (tagId, name) => {
    const kept = await repo.renameTag(await getDb(), tagId, name);
    // A rename that merged into another tag keeps the filter on the merged tag.
    if (get().tagFilter?.tagId === tagId && kept !== tagId) await get().setTagFilter(kept);
    await reloadTags(get, set);
  }),
  setTagColor: guard(async (tagId, color) => {
    await repo.setTagColor(await getDb(), tagId, color);
    await reloadTags(get, set);
  }),
  deleteTag: guard(async (tagId) => {
    await repo.deleteTag(await getDb(), tagId);
    if (get().tagFilter?.tagId === tagId) set({ tagFilter: null });
    await reloadTags(get, set);
  }),
  setTagFilter: guard(async (tagId) => {
    if (!tagId) return set({ tagFilter: null });
    const pageIds = new Set(await repo.pageIdsWithTag(await getDb(), tagId));
    set({ tagFilter: { tagId, pageIds } });
  }),

  themePref: readThemePref(),
  theme: resolveTheme(readThemePref()),
  darkPdf: readDarkPdf(),

  setThemePref(pref) {
    saveThemePref(pref);
    const theme = resolveTheme(pref);
    set({ themePref: pref, theme });
    applyTheme(pref, theme, get().darkPdf);
  },
  setDarkPdf(on) {
    saveDarkPdf(on);
    set({ darkPdf: on });
    applyTheme(get().themePref, get().theme, on);
  },
  syncSystemTheme() {
    const { themePref, theme, darkPdf } = get();
    const next = resolveTheme(themePref);
    if (next === theme) return;
    set({ theme: next });
    applyTheme(themePref, next, darkPdf);
  },

  init: guard(async () => {
    const db = await getDb();
    // Before anything is shown, so the open note loads the repaired text.
    await repairOldPdfText(db).catch((e) => console.warn("repair failed", e));
    const [tree, lastPage, viewMode, mainView] = await Promise.all([
      repo.loadTree(db),
      repo.kvGet(db, "lastPageId"),
      repo.kvGet(db, "viewMode"),
      repo.kvGet(db, "mainView"),
    ]);
    await repo.deleteUnusedTags(db);
    set({ tree, ready: true, viewMode: (viewMode as ViewMode | null) ?? "split", tags: await repo.listTags(db) });
    if (lastPage) await get().selectPage(lastPage);
    // Reopen Today or a course overview if that was showing.
    if (mainView === "today") set({ view: { kind: "today" } });
    else if (mainView?.startsWith("course:")) {
      const courseId = mainView.slice("course:".length);
      if (tree.some((s) => s.courses.some((c) => c.id === courseId))) set({ view: { kind: "course", courseId } });
    }
    // Read PDFs that search doesn't know yet (in the background).
    indexPdfs();
    // Housekeeping: drop snips no note uses, then files nothing refers to (e.g. from deleted courses).
    (async () => {
      await repo.deleteUnusedSnips(db);
      await pruneStoredFiles(await repo.listStoredPaths(db));
    })().catch((e) => console.warn("cleanup failed", e));
  }),

  refresh: guard(async () => {
    const db = await getDb();
    const [tree, tags] = await Promise.all([repo.loadTree(db), repo.listTags(db)]);
    set({ tree, tags });
    // A course overview whose course was deleted falls back to Today.
    const view = get().view;
    if (view.kind === "course" && !tree.some((s) => s.courses.some((c) => c.id === view.courseId)))
      set({ view: { kind: "today" } });
    get().bumpStudy();
    // A tag whose last page was deleted disappears; so does a filter on it.
    const filter = get().tagFilter;
    if (filter && !tags.some((t) => t.id === filter.tagId)) set({ tagFilter: null });
  }),

  selectPage: guard(async (id) => {
    const db = await getDb();
    const page = id ? await repo.getPage(db, id) : null;
    const pdf = page?.documentId ? await repo.getDocument(db, page.documentId) : null;
    const pageTags = page ? await repo.pageTags(db, page.id) : [];
    set({ selectedPageId: page?.id ?? null, page, pdf, pageTags, ...(page && { view: { kind: "page" as const } }) });
    await repo.kvSet(db, "lastPageId", page?.id ?? "");
    if (page) await repo.kvSet(db, "mainView", "page");
  }),

  setViewMode(mode) {
    set({ viewMode: mode });
    getDb().then((db) => repo.kvSet(db, "viewMode", mode));
  },

  setSearchOpen(open) {
    set({ searchOpen: open });
  },

  addSemester: guard(async (name) => {
    await repo.createSemester(await getDb(), name);
    await get().refresh();
  }),
  renameSemester: guard(async (id, name) => {
    await repo.renameSemester(await getDb(), id, name);
    await get().refresh();
  }),
  toggleSemester: guard(async (id) => {
    const s = get().tree.find((x) => x.id === id);
    if (!s) return;
    await repo.setSemesterCollapsed(await getDb(), id, !s.collapsed);
    await get().refresh();
  }),
  deleteSemester: guard(async (id) => {
    await repo.deleteSemester(await getDb(), id);
    await get().refresh();
    await reselectIfGone(get);
  }),

  addCourse: guard(async (semesterId, name) => {
    const db = await getDb();
    await repo.createCourse(db, semesterId, name);
    const s = get().tree.find((x) => x.id === semesterId);
    if (s?.collapsed) await repo.setSemesterCollapsed(db, semesterId, false);
    await get().refresh();
  }),
  renameCourse: guard(async (id, name) => {
    await repo.renameCourse(await getDb(), id, name);
    await get().refresh();
  }),
  toggleCourse: guard(async (id) => {
    const c = get()
      .tree.flatMap((s) => s.courses)
      .find((x) => x.id === id);
    if (!c) return;
    await repo.setCourseCollapsed(await getDb(), id, !c.collapsed);
    await get().refresh();
  }),
  deleteCourse: guard(async (id) => {
    await repo.deleteCourse(await getDb(), id);
    await get().refresh();
    await reselectIfGone(get);
  }),

  addPage: guard(async (courseId, folderId = null) => {
    const db = await getDb();
    const id = await repo.createPage(db, courseId, "", folderId);
    await repo.setCourseCollapsed(db, courseId, false);
    if (folderId) await expandFolderPath(get, folderId);
    await get().refresh();
    await get().selectPage(id);
  }),
  savePage: guard(async (id, patch) => {
    const db = await getDb();
    await repo.updatePage(db, id, patch);
    if (patch.content !== undefined) {
      let blocks: unknown = [];
      try {
        blocks = JSON.parse(patch.content);
      } catch {
        // keep empty
      }
      await repo.syncNoteRefs(db, id, extractNoteRefs(blocks));
      await study.syncCards(db, id, extractCards(blocks));
      set((s) => ({ refsVersion: s.refsVersion + 1 }));
      get().bumpStudy();
    }
    const current = get().page;
    if (current?.id === id) {
      set({
        page: {
          ...current,
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.plainText !== undefined && { plainText: patch.plainText }),
          ...(patch.content !== undefined && { content: patch.content }),
          updatedAt: new Date().toISOString(),
        },
      });
    }
    if (patch.title !== undefined) await get().refresh();
  }),
  deletePage: guard(async (id) => {
    await repo.deletePage(await getDb(), id);
    await get().refresh();
    await reselectIfGone(get);
  }),

  movePage: guard(async (pageId, courseId, folderId = null) => {
    const db = await getDb();
    await repo.movePage(db, pageId, courseId, folderId);
    await repo.setCourseCollapsed(db, courseId, false);
    if (folderId) await expandFolderPath(get, folderId);
    await get().refresh();
    await reloadOpenPage(get);
  }),

  addFolder: guard(async (courseId, parentId, name) => {
    const db = await getDb();
    await repo.createFolder(db, courseId, parentId, name);
    await repo.setCourseCollapsed(db, courseId, false);
    if (parentId) await expandFolderPath(get, parentId);
    await get().refresh();
  }),
  renameFolder: guard(async (id, name) => {
    await repo.renameFolder(await getDb(), id, name);
    await get().refresh();
  }),
  toggleFolder: guard(async (id) => {
    const f = findFolder(get().tree, id);
    if (!f) return;
    await repo.setFolderCollapsed(await getDb(), id, !f.collapsed);
    await get().refresh();
  }),
  deleteFolder: guard(async (id) => {
    await repo.deleteFolder(await getDb(), id);
    await get().refresh();
    await reselectIfGone(get);
  }),
  moveFolder: guard(async (id, courseId, parentId) => {
    const db = await getDb();
    await repo.moveFolder(db, id, courseId, parentId);
    await repo.setCourseCollapsed(db, courseId, false);
    if (parentId) await expandFolderPath(get, parentId);
    await get().refresh();
    await reloadOpenPage(get);
  }),

  attachPdf: guard(async () => {
    const page = get().page;
    if (!page) return;
    const file = await pickAndImportPdf();
    if (!file) return;
    const db = await getDb();
    const previous = await repo.detachDocument(db, page.id);
    if (previous) await removeStoredFile(previous);
    const docId = await repo.createDocument(db, page.courseId, file);
    await repo.updatePage(db, page.id, { documentId: docId });
    if (get().viewMode === "note") get().setViewMode("split");
    await get().refresh();
    await reloadOpenPage(get);
    indexPdfs();
  }),

  renamePdf: guard(async (title) => {
    const pdf = get().pdf;
    if (!pdf || !title.trim()) return;
    await repo.renameDocument(await getDb(), pdf.id, title);
    set({ pdf: { ...pdf, title: title.trim() } });
    await get().refresh();
  }),

  showPagePdf: guard(async () => {
    const page = get().page;
    const db = await getDb();
    set({ pdf: page?.documentId ? await repo.getDocument(db, page.documentId) : null });
  }),

  sendToNote(blocks) {
    if (!get().page) return;
    if (get().viewMode === "pdf") get().setViewMode("split");
    set((s) => ({ noteQueue: [...s.noteQueue, ...blocks] }));
  },

  takeNoteQueue() {
    const q = get().noteQueue;
    if (q.length) set({ noteQueue: [] });
    return q;
  },

  focusNoteBlock: guard(async (pageId, blockId) => {
    if (get().selectedPageId !== pageId) await get().selectPage(pageId);
    if (get().viewMode === "pdf") get().setViewMode("split");
    set({ focusBlock: { pageId, blockId, nonce: Date.now() } });
  }),

  jumpToPdf: guard(async (documentId, pageNumber, highlightId) => {
    if (get().pdf?.id !== documentId) {
      const doc = await repo.getDocument(await getDb(), documentId);
      if (!doc) throw new Error("That PDF has been removed.");
      set({ pdf: doc });
    }
    if (get().viewMode === "note") get().setViewMode("split");
    set({ pdfJump: { documentId, pageNumber, highlightId, nonce: Date.now() } });
  }),

  openPdfHit: guard(async (pageId, documentId, pageNumber, query) => {
    if (get().selectedPageId !== pageId || get().view.kind !== "page") await get().selectPage(pageId);
    if (get().pdf?.id !== documentId) {
      const doc = await repo.getDocument(await getDb(), documentId);
      if (!doc) throw new Error("That PDF has been removed.");
      set({ pdf: doc });
    }
    if (get().viewMode === "note") get().setViewMode("split");
    set({ pdfFind: { documentId, query, pageNumber, nonce: Date.now() } });
  }),

  removePdf: guard(async () => {
    const page = get().page;
    if (!page) return;
    const freed = await repo.detachDocument(await getDb(), page.id);
    if (freed) await removeStoredFile(freed);
    await get().refresh();
    await reloadOpenPage(get);
  }),
}));

/** After a tag change: the tag list, the open page's tags and the sidebar filter. */
async function reloadTags(
  get: () => State,
  set: (partial: Partial<State>) => void,
) {
  const db = await getDb();
  const page = get().page;
  const [tags, pageTags] = await Promise.all([
    repo.listTags(db),
    page ? repo.pageTags(db, page.id) : Promise.resolve([]),
  ]);
  set({ tags, pageTags });
  const filter = get().tagFilter;
  if (!filter) return;
  if (!tags.some((t) => t.id === filter.tagId)) set({ tagFilter: null });
  else set({ tagFilter: { tagId: filter.tagId, pageIds: new Set(await repo.pageIdsWithTag(db, filter.tagId)) } });
}

/** Reloads the open page and its PDF from the database (after attaching/removing). */
async function reloadOpenPage(get: () => State) {
  const id = get().selectedPageId;
  if (id) await get().selectPage(id);
}

async function reselectIfGone(get: () => State) {
  const { selectedPageId, tree, selectPage } = get();
  if (!selectedPageId) return;
  const exists = tree.some((s) => s.courses.some((c) => c.pages.some((p) => p.id === selectedPageId)));
  if (!exists) await selectPage(null);
}

/** Finds the semester, course and folder path of a page (for the breadcrumb and exports). */
export function locatePage(tree: SemesterNode[], pageId: string | null) {
  if (!pageId) return null;
  for (const semester of tree)
    for (const course of semester.courses)
      for (const page of course.pages)
        if (page.id === pageId) return { semester, course, page, folders: folderPath(course.folders, page.folderId) };
  return null;
}

/** The folders from the top of the course down to (and including) this one. */
export function folderPath(folders: Folder[], folderId: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  for (let f = folderId ? byId.get(folderId) : undefined; f && path.length < 64; f = f.parentId ? byId.get(f.parentId) : undefined)
    path.unshift(f);
  return path;
}

function findFolder(tree: SemesterNode[], id: string): Folder | undefined {
  for (const s of tree) for (const c of s.courses) for (const f of c.folders) if (f.id === id) return f;
  return undefined;
}

/** Opens a folder and all folders above it, so something just put there is visible. */
async function expandFolderPath(get: () => State, folderId: string) {
  const db = await getDb();
  let course;
  for (const s of get().tree) for (const c of s.courses) if (c.folders.some((f) => f.id === folderId)) course = c;
  if (!course) return;
  for (const f of folderPath(course.folders, folderId))
    if (f.collapsed) await repo.setFolderCollapsed(db, f.id, false);
}
