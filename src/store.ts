import { create } from "zustand";
import { getDb } from "./lib/db";
import * as repo from "./lib/repo";
import type { Document, Page, PagePatch, SemesterNode } from "./lib/repo";
import { pickAndImportPdf, pruneStoredFiles, removeStoredFile } from "./lib/files";
import { extractNoteRefs } from "./editor/content";

export type ViewMode = "pdf" | "split" | "note";

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
  /** Bumped whenever note ↔ highlight links change, so the viewer reloads its "In note" chips. */
  refsVersion: number;
  /** Short confirmation shown in a toast (e.g. after an export). */
  notice: string | null;
  /** Saves the open note right away (registered by the note pane); used before exporting. */
  flushNote: (() => Promise<void>) | null;

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

  addPage(courseId: string): Promise<void>;
  savePage(id: string, patch: PagePatch): Promise<void>;
  deletePage(id: string): Promise<void>;

  movePage(pageId: string, courseId: string): Promise<void>;

  attachPdf(): Promise<void>;
  removePdf(): Promise<void>;
  renamePdf(title: string): Promise<void>;
  /** Shows the open page's own PDF again after jumping to another one. */
  showPagePdf(): Promise<void>;

  sendToNote(blocks: unknown[]): void;
  takeNoteQueue(): unknown[];
  focusNoteBlock(pageId: string, blockId: string): Promise<void>;
  jumpToPdf(documentId: string, pageNumber: number, highlightId?: string): Promise<void>;
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
  refsVersion: 0,
  notice: null,
  flushNote: null,

  init: guard(async () => {
    const db = await getDb();
    const [tree, lastPage, viewMode] = await Promise.all([
      repo.loadTree(db),
      repo.kvGet(db, "lastPageId"),
      repo.kvGet(db, "viewMode"),
    ]);
    set({ tree, ready: true, viewMode: (viewMode as ViewMode | null) ?? "split" });
    if (lastPage) await get().selectPage(lastPage);
    // Housekeeping: drop snips no note uses, then files nothing refers to (e.g. from deleted courses).
    (async () => {
      await repo.deleteUnusedSnips(db);
      await pruneStoredFiles(await repo.listStoredPaths(db));
    })().catch((e) => console.warn("cleanup failed", e));
  }),

  refresh: guard(async () => {
    set({ tree: await repo.loadTree(await getDb()) });
  }),

  selectPage: guard(async (id) => {
    const db = await getDb();
    const page = id ? await repo.getPage(db, id) : null;
    const pdf = page?.documentId ? await repo.getDocument(db, page.documentId) : null;
    set({ selectedPageId: page?.id ?? null, page, pdf });
    await repo.kvSet(db, "lastPageId", page?.id ?? "");
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

  addPage: guard(async (courseId) => {
    const db = await getDb();
    const id = await repo.createPage(db, courseId);
    await repo.setCourseCollapsed(db, courseId, false);
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
      set((s) => ({ refsVersion: s.refsVersion + 1 }));
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

  movePage: guard(async (pageId, courseId) => {
    const db = await getDb();
    await repo.movePage(db, pageId, courseId);
    await repo.setCourseCollapsed(db, courseId, false);
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

  removePdf: guard(async () => {
    const page = get().page;
    if (!page) return;
    const freed = await repo.detachDocument(await getDb(), page.id);
    if (freed) await removeStoredFile(freed);
    await get().refresh();
    await reloadOpenPage(get);
  }),
}));

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

/** Finds the semester and course a page belongs to (for the breadcrumb). */
export function locatePage(tree: SemesterNode[], pageId: string | null) {
  if (!pageId) return null;
  for (const semester of tree)
    for (const course of semester.courses)
      for (const page of course.pages) if (page.id === pageId) return { semester, course, page };
  return null;
}
