import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../lib/db";
import * as repo from "../lib/repo";
import { memoryDb } from "../lib/testDb";
import * as ink from "./inkRepo";
import { compactPoints, eraseAlong, hasPressure, parseStrokes, touchesStroke, type Stroke } from "./model";

const stroke = (id: string, pts: number[], size = 4): Stroke => ({ id, tool: "pen", color: "ink", size, pts });

describe("ink model", () => {
  it("rounds points and drops repeats where the pen rests", () => {
    expect(compactPoints([10.04, 20.06, 0.333, 10.01, 20.02, 0.5, 30, 40, -1])).toEqual([10, 20.1, 0.33, 10, 20, 0.5, 30, 40, -1]);
    expect(compactPoints([5, 5, 0.2, 5, 5, 0.6, 6, 5, 0.4])).toEqual([5, 5, 0.6, 6, 5, 0.4]);
  });

  it("tells real pen pressure from a mouse or a tablet without pressure", () => {
    expect(hasPressure([0, 0, 0.2, 1, 1, 0.4])).toBe(true);
    expect(hasPressure([0, 0, 0.5, 1, 1, 0.5])).toBe(false); // mouse
    expect(hasPressure([0, 0, 0, 1, 1, 0])).toBe(false);
    expect(hasPressure([0, 0, -1, 1, 1, -1])).toBe(false);
    expect(hasPressure([0, 0, 0.7])).toBe(true);
  });

  it("finds strokes touched by the eraser, including the gap between points", () => {
    const line = stroke("a", [0, 0, 0.5, 100, 0, 0.5], 4);
    expect(touchesStroke(line, 50, 3, 2)).toBe(true); // between the two points, within reach
    expect(touchesStroke(line, 50, 10, 2)).toBe(false);
    expect(touchesStroke(stroke("dot", [10, 10, 0.5]), 12, 10, 1)).toBe(true);
    const left = eraseAlong([line, stroke("b", [0, 200, 0.5, 100, 200, 0.5])], [40, -5, 60, 5], 3);
    expect(left.map((s) => s.id)).toEqual(["b"]);
  });

  it("skips malformed stored strokes", () => {
    const good = stroke("a", [1, 2, 0.5]);
    expect(parseStrokes(JSON.stringify([good, { id: "x" }, { ...good, pts: [1, "a", 2] }]))).toEqual([good]);
    expect(parseStrokes("not json")).toEqual([]);
  });
});

describe("ink repository", () => {
  let db: Db;
  let pageId: string;
  beforeEach(async () => {
    db = memoryDb();
    const s = await repo.createSemester(db, "Winter");
    const c = await repo.createCourse(db, s, "Algorithms");
    pageId = await repo.createPage(db, c, "Hashing");
  });

  it("adds sheets in order, saves strokes and paper, and deletes them with the page", async () => {
    const a = await ink.addSheet(db, pageId, "lined");
    const b = await ink.addSheet(db, pageId, "lined");
    expect(b.position).toBeGreaterThan(a.position);
    await ink.saveStrokes(db, a.id, [stroke("s1", [1, 2, 0.5, 3, 4, 0.6])]);
    await ink.setPaper(db, pageId, "grid");
    const sheets = await ink.listSheets(db, pageId);
    expect(sheets.map((s) => [s.id, s.paper, s.strokes.length])).toEqual([
      [a.id, "grid", 1],
      [b.id, "grid", 0],
    ]);
    const byPage = await ink.sheetsByPage(db);
    expect(byPage.get(pageId)?.map((s) => s.id)).toEqual([a.id]); // empty sheets aren't exported

    await ink.deleteSheet(db, b.id);
    expect((await ink.listSheets(db, pageId)).length).toBe(1);
    await repo.deletePage(db, pageId);
    expect((await ink.listSheets(db, pageId)).length).toBe(0);
  });
});
