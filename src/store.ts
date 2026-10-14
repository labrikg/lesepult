import { create } from "zustand";
import { getDb } from "./lib/db";
import * as repo from "./lib/repo";
import type { Page, PagePatch, SemesterNode } from "./lib/repo";

export type ViewMode = "pdf" | "split" | "note";

interface State {
  ready: boolean;
  error: string | null;
  tree: SemesterNode[];
  selectedPageId: string | null;
  page: Page | null;
  viewMode: ViewMode;
  searchOpen: boolean;

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
  viewMode: "split",
  searchOpen: false,

  init: guard(async () => {
    const db = await getDb();
    const [tree, lastPage, viewMode] = await Promise.all([
      repo.loadTree(db),
      repo.kvGet(db, "lastPageId"),
      repo.kvGet(db, "viewMode"),
    ]);
    set({ tree, ready: true, viewMode: (viewMode as ViewMode | null) ?? "split" });
    if (lastPage) await get().selectPage(lastPage);
  }),

  refresh: guard(async () => {
    set({ tree: await repo.loadTree(await getDb()) });
  }),

  selectPage: guard(async (id) => {
    const db = await getDb();
    const page = id ? await repo.getPage(db, id) : null;
    set({ selectedPageId: page?.id ?? null, page });
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
    await repo.updatePage(await getDb(), id, patch);
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
}));

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
