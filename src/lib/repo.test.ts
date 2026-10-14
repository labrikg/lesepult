import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import BetterSqlite from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import * as repo from "./repo";

const migration = readFileSync(
  fileURLToPath(new URL("../../src-tauri/migrations/0001_init.sql", import.meta.url)),
  "utf8",
);

/** Adapter: runs the app's `$1`-style SQL on an in-memory better-sqlite3 database. */
function memoryDb(): Db {
  const sqlite = new BetterSqlite(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(migration);
  const prepare = (sql: string, params: unknown[]) => {
    const ordered: unknown[] = [];
    const text = sql.replace(/\$(\d+)/g, (_, n) => {
      ordered.push(params[Number(n) - 1]);
      return "?";
    });
    return { stmt: sqlite.prepare(text), args: ordered };
  };
  return {
    async select<T>(sql: string, params: unknown[] = []) {
      const { stmt, args } = prepare(sql, params);
      return stmt.all(...args) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const { stmt, args } = prepare(sql, params);
      stmt.run(...args);
    },
  };
}

describe("repository", () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it("builds the semester → course → page tree in order", async () => {
    const s1 = await repo.createSemester(db, "Winter 26/27");
    const s2 = await repo.createSemester(db, "Summer 26");
    const algo = await repo.createCourse(db, s1, "Algorithms & Data Structures");
    const hci = await repo.createCourse(db, s1, "Human-Computer Interaction");
    await repo.createPage(db, algo, "Lecture 06 · Trees");
    await repo.createPage(db, algo, "Lecture 07 · Hashing");

    const tree = await repo.loadTree(db);
    expect(tree.map((s) => s.name)).toEqual(["Winter 26/27", "Summer 26"]);
    expect(tree[0].courses.map((c) => c.name)).toEqual([
      "Algorithms & Data Structures",
      "Human-Computer Interaction",
    ]);
    expect(tree[0].courses[0].pages.map((p) => p.title)).toEqual([
      "Lecture 06 · Trees",
      "Lecture 07 · Hashing",
    ]);
    expect(tree[0].courses[0].color).not.toBe(tree[0].courses[1].color);
    expect(tree[1].id).toBe(s2);
    expect(hci).toBeTruthy();
  });

  it("updates pages and finds them through full-text search", async () => {
    const s = await repo.createSemester(db, "Winter 26/27");
    const c = await repo.createCourse(db, s, "Algorithms");
    const p = await repo.createPage(db, c, "Hashing");
    await repo.updatePage(db, p, { plainText: "Open addressing walks a probe sequence." });

    const hits = await repo.searchPages(db, "prob");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ pageId: p, title: "Hashing", courseName: "Algorithms" });
    expect(hits[0].snippet).toContain("\u0002probe\u0003");

    await repo.updatePage(db, p, { title: "Open addressing", plainText: "Chaining instead." });
    expect(await repo.searchPages(db, "probe")).toHaveLength(0);
    expect(await repo.searchPages(db, "chaining")).toHaveLength(1);
    expect((await repo.getPage(db, p))?.title).toBe("Open addressing");
  });

  it("ignores quote characters in search input", async () => {
    expect(repo.toFtsQuery(' hash "map  ')).toBe('"hash"* "map"*');
    expect(await repo.searchPages(db, '"')).toEqual([]);
  });

  it("cascades deletes from semester down to pages and the search index", async () => {
    const s = await repo.createSemester(db, "Winter 26/27");
    const c = await repo.createCourse(db, s, "Algorithms");
    await repo.createPage(db, c, "Hashing");
    await repo.deleteSemester(db, s);
    expect(await repo.loadTree(db)).toEqual([]);
    expect(await repo.searchPages(db, "hashing")).toEqual([]);
  });

  it("stores UI state", async () => {
    expect(await repo.kvGet(db, "viewMode")).toBeNull();
    await repo.kvSet(db, "viewMode", "split");
    await repo.kvSet(db, "viewMode", "note");
    expect(await repo.kvGet(db, "viewMode")).toBe("note");
  });

  it("attaches PDFs to pages and frees the file once no page uses it", async () => {
    const s = await repo.createSemester(db, "Winter 26/27");
    const c = await repo.createCourse(db, s, "Algorithms");
    const p1 = await repo.createPage(db, c, "Lecture 07");
    const p2 = await repo.createPage(db, c, "Exercise 4");
    const file = { fileName: "07-Hashing.PDF", storedPath: "documents/abc.pdf", sha256: "ff" };
    const doc = await repo.createDocument(db, c, file);
    await repo.updatePage(db, p1, { documentId: doc });
    await repo.updatePage(db, p2, { documentId: doc });

    expect(await repo.getDocument(db, doc)).toMatchObject({
      title: "07-Hashing",
      fileName: "07-Hashing.PDF",
      storedPath: "documents/abc.pdf",
      pageCount: null,
    });
    await repo.setDocumentPageCount(db, doc, 38);
    expect((await repo.getDocument(db, doc))?.pageCount).toBe(38);
    expect((await repo.loadTree(db))[0].courses[0].pages[0].documentId).toBe(doc);
    expect(await repo.listStoredPaths(db)).toEqual(["documents/abc.pdf"]);

    // Still used by p2: row and file stay.
    expect(await repo.detachDocument(db, p1)).toBeNull();
    expect(await repo.getDocument(db, doc)).not.toBeNull();
    // Last user gone: row deleted, file path handed back for deletion.
    expect(await repo.detachDocument(db, p2)).toBe("documents/abc.pdf");
    expect(await repo.getDocument(db, doc)).toBeNull();
    expect(await repo.listStoredPaths(db)).toEqual([]);
    expect(await repo.detachDocument(db, p2)).toBeNull();
  });

  it("moves a page and its PDF to another course and renames PDFs", async () => {
    const s = await repo.createSemester(db, "Winter 26/27");
    const net = await repo.createCourse(db, s, "Datenkommunikation");
    const crypto = await repo.createCourse(db, s, "Cryptography");
    await repo.createPage(db, crypto, "Existing");
    const p = await repo.createPage(db, net, "Untitled");
    const doc = await repo.createDocument(db, net, {
      fileName: "rsa.pdf",
      storedPath: "documents/r.pdf",
      sha256: "1",
    });
    await repo.updatePage(db, p, { documentId: doc });

    await repo.movePage(db, p, crypto);
    await repo.updatePage(db, p, { title: "RSA" });
    await repo.renameDocument(db, doc, "  RSA slides ");

    const tree = await repo.loadTree(db);
    expect(tree[0].courses[0].pages).toEqual([]);
    expect(tree[0].courses[1].pages.map((x) => x.title)).toEqual(["Existing", "RSA"]);
    expect(tree[0].courses[1].documents.map((d) => d.title)).toEqual(["RSA slides"]);
    expect(await repo.searchPages(db, "rsa")).toHaveLength(1);
  });

  it("leaves a shared PDF in place when only one of its pages moves", async () => {
    const s = await repo.createSemester(db, "S");
    const a = await repo.createCourse(db, s, "A");
    const b = await repo.createCourse(db, s, "B");
    const p1 = await repo.createPage(db, a, "Lecture");
    const p2 = await repo.createPage(db, a, "Exercise");
    const doc = await repo.createDocument(db, a, {
      fileName: "x.pdf",
      storedPath: "documents/x.pdf",
      sha256: "1",
    });
    await repo.updatePage(db, p1, { documentId: doc });
    await repo.updatePage(db, p2, { documentId: doc });
    await repo.movePage(db, p1, b);
    expect((await repo.getDocument(db, doc))?.courseId).toBe(a);
    expect((await repo.getPage(db, p1))?.documentId).toBe(doc);
    await repo.movePage(db, p1, b); // moving to the same course is a no-op
    expect((await repo.getPage(db, p1))?.courseId).toBe(b);
  });

  it("stores, updates and deletes highlights per PDF", async () => {
    const s = await repo.createSemester(db, "S");
    const c = await repo.createCourse(db, s, "C");
    const doc = await repo.createDocument(db, c, {
      fileName: "a.pdf",
      storedPath: "documents/a.pdf",
      sha256: "1",
    });
    const rects = [{ x: 0.1, y: 0.4, w: 0.5, h: 0.04 }];
    const h2 = await repo.createHighlight(db, {
      documentId: doc,
      pageNumber: 6,
      rects,
      color: "yellow",
      text: "probe",
    });
    const h1 = await repo.createHighlight(db, {
      documentId: doc,
      pageNumber: 2,
      rects,
      color: "blue",
      text: "O(1)",
      comment: "exam",
    });

    let list = await repo.listHighlights(db, doc);
    expect(list.map((h) => h.id)).toEqual([h1.id, h2.id]);
    expect(list[1]).toMatchObject({ pageNumber: 6, rects, color: "yellow", text: "probe", comment: null });

    await repo.updateHighlight(db, h2.id, { color: "green", comment: "  why does order matter? " });
    await repo.updateHighlight(db, h1.id, { comment: "   " });
    list = await repo.listHighlights(db, doc);
    expect(list[1]).toMatchObject({ color: "green", comment: "why does order matter?" });
    expect(list[0].comment).toBeNull();

    await repo.deleteHighlight(db, h1.id);
    expect((await repo.listHighlights(db, doc)).map((h) => h.id)).toEqual([h2.id]);

    // Highlights go with their PDF.
    await db.execute("DELETE FROM documents WHERE id = $1", [doc]);
    expect(await repo.listHighlights(db, doc)).toEqual([]);
  });

  it("rejects unknown highlight colours at the database level", async () => {
    const s = await repo.createSemester(db, "S");
    const c = await repo.createCourse(db, s, "C");
    const doc = await repo.createDocument(db, c, {
      fileName: "a.pdf",
      storedPath: "documents/a.pdf",
      sha256: "1",
    });
    await expect(
      repo.createHighlight(db, {
        documentId: doc,
        pageNumber: 1,
        rects: [],
        color: "pink" as repo.HighlightColor,
        text: "",
      }),
    ).rejects.toThrow();
  });

  it("tracks which highlights and snips a note uses", async () => {
    const s = await repo.createSemester(db, "S");
    const c = await repo.createCourse(db, s, "C");
    const page = await repo.createPage(db, c, "Hashing");
    const other = await repo.createPage(db, c, "Summary");
    const doc = await repo.createDocument(db, c, {
      fileName: "a.pdf",
      storedPath: "documents/a.pdf",
      sha256: "1",
    });
    const rects = [{ x: 0, y: 0, w: 0.5, h: 0.05 }];
    const h1 = await repo.createHighlight(db, {
      documentId: doc,
      pageNumber: 1,
      rects,
      color: "yellow",
      text: "a",
    });
    const h2 = await repo.createHighlight(db, {
      documentId: doc,
      pageNumber: 2,
      rects,
      color: "blue",
      text: "b",
    });
    const snip = await repo.createSnip(db, {
      documentId: doc,
      pageNumber: 3,
      rect: rects[0],
      imagePath: "documents/s.png",
    });
    const unused = await repo.createSnip(db, {
      documentId: doc,
      pageNumber: 4,
      rect: rects[0],
      imagePath: "documents/u.png",
    });

    await repo.syncNoteRefs(db, page, [
      { blockId: "b1", highlightId: h1.id },
      { blockId: "b2", snipId: snip.id },
      { blockId: "b3", highlightId: "deleted-highlight" },
    ]);
    await repo.syncNoteRefs(db, other, [{ blockId: "b9", highlightId: h2.id }]);
    // Order follows the (random) page ids, so compare without relying on it.
    expect((await repo.highlightLinks(db, doc)).sort((a, b) => a.blockId.localeCompare(b.blockId))).toEqual([
      { highlightId: h1.id, pageId: page, blockId: "b1" },
      { highlightId: h2.id, pageId: other, blockId: "b9" },
    ]);

    // Re-syncing replaces the page's links.
    await repo.syncNoteRefs(db, page, [{ blockId: "b2", snipId: snip.id }]);
    expect((await repo.highlightLinks(db, doc)).map((l) => l.blockId)).toEqual(["b9"]);

    expect((await repo.listStoredPaths(db)).sort()).toEqual([
      "documents/a.pdf",
      "documents/s.png",
      "documents/u.png",
    ]);
    await repo.deleteUnusedSnips(db);
    expect((await repo.listStoredPaths(db)).sort()).toEqual(["documents/a.pdf", "documents/s.png"]);
    expect(unused.id).toBeTruthy();

    // Deleting the page drops its links.
    await repo.deletePage(db, other);
    expect(await repo.highlightLinks(db, doc)).toEqual([]);
  });

  it("drops a page's PDF link when the course's document is deleted", async () => {
    const s = await repo.createSemester(db, "S");
    const c = await repo.createCourse(db, s, "C");
    const p = await repo.createPage(db, c, "P");
    const doc = await repo.createDocument(db, c, {
      fileName: "a.pdf",
      storedPath: "documents/a.pdf",
      sha256: "1",
    });
    await repo.updatePage(db, p, { documentId: doc });
    await db.execute("DELETE FROM documents WHERE id = $1", [doc]);
    expect((await repo.getPage(db, p))?.documentId).toBeNull();
  });
});
