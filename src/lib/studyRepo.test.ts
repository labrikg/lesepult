import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import * as repo from "./repo";
import * as study from "./studyRepo";
import { memoryDb } from "./testDb";
import { formatInterval, preview } from "../study/srs";

describe("study tools", () => {
  let db: Db;
  let course: string;
  let other: string;
  let page: string;
  beforeEach(async () => {
    db = memoryDb();
    const s = await repo.createSemester(db, "WS");
    course = await repo.createCourse(db, s, "Theoretische Informatik");
    other = await repo.createCourse(db, s, "Datenkommunikation");
    page = await repo.createPage(db, course, "Turing-Maschinen");
  });

  describe("cards", () => {
    it("mirrors the card blocks of a note", async () => {
      await study.syncCards(db, page, [
        { blockId: "b1", front: "Was ist $\\Sigma$?", back: "Das Alphabet" },
        { blockId: "b2", front: "Halteproblem?", back: "Unentscheidbar" },
      ]);
      let cards = await study.listCards(db, course);
      expect(cards.map((c) => [c.blockId, c.front, c.state, c.courseName])).toEqual([
        ["b1", "Was ist $\\Sigma$?", 0, "Theoretische Informatik"],
        ["b2", "Halteproblem?", 0, "Theoretische Informatik"],
      ]);

      // Review b1 so it has history, then edit it, remove b2 and add b3.
      const b1 = cards[0];
      const good = preview(null, 0, new Date("2026-10-14T10:00:00Z"))[2];
      await study.recordReview(db, b1.id, good.result);
      await study.syncCards(db, page, [
        { blockId: "b1", front: "Was ist $\\Sigma$ hier?", back: "Das Eingabealphabet" },
        { blockId: "b3", front: "DTM?", back: "Deterministische TM", highlightId: "missing" },
      ]);
      cards = await study.listCards(db, course);
      expect(cards.map((c) => c.blockId)).toEqual(["b1", "b3"]);
      expect(cards[0]).toMatchObject({ id: b1.id, front: "Was ist $\\Sigma$ hier?", state: good.result.state });
      expect(cards[1].highlightId).toBeNull(); // a highlight that doesn't exist isn't linked
    });

    it("finds due cards, learning ones first, and counts per course", async () => {
      await study.syncCards(db, page, [
        { blockId: "new", front: "a", back: "b" },
        { blockId: "learning", front: "c", back: "d" },
        { blockId: "later", front: "e", back: "f" },
      ]);
      const [fresh, learning, later] = await study.listCards(db, course);
      const t0 = new Date(); // new cards are due from when they were made
      const again = preview(null, 0, t0)[0].result; // relearn in a minute
      await study.recordReview(db, learning.id, again);
      const easy = preview(null, 0, t0)[3].result; // days away
      await study.recordReview(db, later.id, easy);

      const at = new Date(t0.getTime() + 5 * 60_000).toISOString();
      const due = await study.dueCards(db, at);
      expect(due.map((c) => c.id)).toEqual([learning.id, fresh.id]);
      expect(await study.dueCards(db, at, other)).toEqual([]);

      const counts = await study.cardCounts(db, at);
      expect(counts).toEqual([{ courseId: course, total: 3, fresh: 1, due: 2, mature: 0 }]);
      expect((await study.reviewsSince(db, new Date(t0.getTime() - 60_000).toISOString())).length).toBe(2);

      await study.resetCard(db, later.id);
      expect((await study.listCards(db)).find((c) => c.id === later.id)?.state).toBe(0);
    });

    it("follows its note into another course and goes away with it", async () => {
      await study.syncCards(db, page, [{ blockId: "b1", front: "a", back: "b" }]);
      await repo.movePage(db, page, other);
      expect((await study.listCards(db, other)).length).toBe(1);
      await repo.deletePage(db, page);
      expect(await study.listCards(db)).toEqual([]);
    });
  });

  describe("scheduling", () => {
    it("offers four answers with growing intervals", () => {
      const options = preview(null, 0, new Date("2026-10-14T10:00:00Z"));
      expect(options.map((o) => o.label)).toEqual(["Again", "Hard", "Good", "Easy"]);
      const dues = options.map((o) => new Date(o.result.due).getTime());
      expect([...dues].sort((a, b) => a - b)).toEqual(dues);
      expect(options[3].result.state).toBe(2); // easy graduates straight to review
    });

    it("keeps memory between reviews", () => {
      let srs: string | null = null;
      let state: study.CardState = 0;
      let t = new Date("2026-10-14T10:00:00Z");
      const intervals: number[] = [];
      for (let i = 0; i < 4; i++) {
        const good: study.ReviewResult = preview(srs, state, t)[2].result;
        srs = good.srs;
        state = good.state;
        const due = new Date(good.due);
        intervals.push(due.getTime() - t.getTime());
        t = due;
      }
      // Answering "good" on time keeps stretching the interval.
      expect(intervals[3]).toBeGreaterThan(intervals[2]);
      expect(intervals[2]).toBeGreaterThan(intervals[1]);
    });

    it("formats intervals", () => {
      expect(formatInterval(30_000)).toBe("1 min");
      expect(formatInterval(10 * 60_000)).toBe("10 min");
      expect(formatInterval(3 * 3600_000)).toBe("3 h");
      expect(formatInterval(12 * 86400_000)).toBe("12 d");
      expect(formatInterval(70 * 86400_000)).toBe("2 mo");
      expect(formatInterval(400 * 86400_000)).toBe("1.1 y");
    });
  });

  describe("deadlines", () => {
    it("lists dates in order, filters by course and from-date, and updates", async () => {
      const exam = await study.createDeadline(db, course, { title: "Klausur", kind: "exam", date: "2027-02-12", time: "09:00" });
      await study.createDeadline(db, other, { title: "Blatt 3", kind: "deadline", date: "2026-10-20" });
      await study.createDeadline(db, course, { title: "Alt", kind: "other", date: "2026-09-01" });

      expect((await study.listDeadlines(db)).map((d) => d.title)).toEqual(["Alt", "Blatt 3", "Klausur"]);
      expect((await study.listDeadlines(db, { from: "2026-10-14" })).map((d) => d.title)).toEqual(["Blatt 3", "Klausur"]);
      const mine = await study.listDeadlines(db, { courseId: course, from: "2026-10-14" });
      expect(mine).toEqual([
        expect.objectContaining({ title: "Klausur", kind: "exam", time: "09:00", courseName: "Theoretische Informatik" }),
      ]);

      await study.updateDeadline(db, exam, { date: "2027-02-14", time: null, done: true, title: "  Klausur TI " });
      expect((await study.listDeadlines(db, { courseId: course }))[1]).toMatchObject({
        title: "Klausur TI",
        date: "2027-02-14",
        time: null,
        done: true,
      });
      await study.deleteDeadline(db, exam);
      expect((await study.listDeadlines(db, { courseId: course })).length).toBe(1);
    });
  });

  describe("to-dos", () => {
    it("adds, ticks off, dates and counts to-dos", async () => {
      const a = await study.createTodo(db, course, "Blatt 3 abgeben", "2026-10-20");
      const b = await study.createTodo(db, course, "Skript lesen");
      await study.createTodo(db, other, "Wireshark üben");

      expect((await study.listTodos(db, { courseId: course })).map((t) => t.title)).toEqual([
        "Blatt 3 abgeben",
        "Skript lesen",
      ]);
      await study.updateTodo(db, a, { done: true });
      await study.updateTodo(db, b, { dueDate: "2026-10-15", title: "Skript Kap. 1 lesen" });
      const list = await study.listTodos(db, { courseId: course });
      expect(list.map((t) => [t.title, t.done, t.dueDate])).toEqual([
        ["Skript Kap. 1 lesen", false, "2026-10-15"],
        ["Blatt 3 abgeben", true, "2026-10-20"],
      ]);
      expect((await study.listTodos(db, { openOnly: true })).length).toBe(2);
      expect((await study.todoProgress(db)).get(course)).toEqual({ done: 1, total: 2 });

      await repo.deleteCourse(db, other);
      expect((await study.listTodos(db)).length).toBe(2);
      await study.deleteTodo(db, a);
      expect((await study.listTodos(db)).length).toBe(1);
    });
  });
});
