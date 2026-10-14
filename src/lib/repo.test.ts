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
});
